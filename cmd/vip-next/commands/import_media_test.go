package commands

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/appctx"
)

// mediaStub serves the GraphQL ops + presign + S3 + error-report
// endpoints for the media-import flow.
type mediaStub struct {
	mu             sync.Mutex
	startReq       string
	abortReq       string
	startHits      atomic.Int32
	abortHits      atomic.Int32
	uploadedBody   []byte
	progressBodies []string
	progressHits   atomic.Int32
	srvURL         string
}

func (s *mediaStub) start(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	s.srvURL = srv.URL

	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"ImportSQLEnvInfo"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"parityapp","typeId":2,"environments":[
				{"id":7,"appId":42,"type":"develop","name":"develop","launched":false,"isK8sResident":true,
				 "primaryDomain":{"name":"example.com"},
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false},
				 "wpSitesSDS":{"nodes":[]}}]}}}`))
		case strings.Contains(bs, `"operationName":"StartMediaImport"`):
			s.mu.Lock()
			s.startReq = bs
			s.mu.Unlock()
			s.startHits.Add(1)
			_, _ = w.Write([]byte(`{"data":{"startMediaImport":{"applicationId":42,"environmentId":7,
				"mediaImportStatus":{"importId":1,"siteId":7,"status":"INITIALIZING"}}}}`))
		case strings.Contains(bs, `"operationName":"AbortMediaImport"`):
			s.mu.Lock()
			s.abortReq = bs
			s.mu.Unlock()
			s.abortHits.Add(1)
			_, _ = w.Write([]byte(`{"data":{"abortMediaImport":{"applicationId":42,"environmentId":7,
				"mediaImportStatusChange":{"importId":1,"siteId":7,"statusFrom":"RUNNING","statusTo":"ABORTING"}}}}`))
		case strings.Contains(bs, `"operationName":"MediaImportProgress"`):
			i := int(s.progressHits.Add(1) - 1)
			s.mu.Lock()
			if i >= len(s.progressBodies) {
				i = len(s.progressBodies) - 1
			}
			resp := s.progressBodies[i]
			s.mu.Unlock()
			_, _ = w.Write([]byte(resp))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), `"action":"GetObject"`) {
			fmt.Fprintf(w, `{"url":"%s/get-me","options":{"method":"GET","headers":{}}}`, s.srvURL)
			return
		}
		fmt.Fprintf(w, `{"url":"%s/s3target","options":{"method":"PUT","headers":{}}}`, s.srvURL)
	})
	mux.HandleFunc("/s3target", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.uploadedBody = body
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/file-errors", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`[{"fileName":"a.jpg","errors":["too big"]}]`))
	})
	return srv
}

// importCtxWithType is importCtx with an explicit app type — the media
// commands gate on App.Type (media-file-import.ts:18).
func importCtxWithType(appID, envID int64, appType string) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "parityapp", Type: appType, TypeId: 2},
		Env: appctx.Env{ID: envID, Name: "develop", Type: "develop"},
	})
}

func mediaProgress(status string, processed, total int, extra string) string {
	return fmt.Sprintf(`{"data":{"app":{"environments":[{"id":7,"name":"develop","type":"develop","repo":"r",
		"mediaImportStatus":{"importId":1,"siteId":7,"status":"%s","filesTotal":%d,"filesProcessed":%d%s}}]}}}`,
		status, total, processed, extra)
}

func setupMediaTest(t *testing.T, stub *mediaStub) {
	t.Helper()
	srv := stub.start(t)
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL,
		Token:     "tok",
	})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_IMPORT_MEDIA_INTERVAL_MS", "1")
}

func TestImportMediaInvalidLocalArchiveExitsZero(t *testing.T) {
	stub := &mediaStub{}
	setupMediaTest(t, stub)

	cmd := ImportMediaCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runImportMedia(cmd, []string{"./dump.sql"}); err != nil {
		t.Fatalf("invalid archive must exit 0, got %v", err)
	}
	out := stdout.String()
	if !strings.Contains(out, "Invalid local archive provided: ./dump.sql") ||
		!strings.Contains(out, ".tar.gz, .tgz, .zip") {
		t.Errorf("stdout = %q", out)
	}
	if stub.startHits.Load() != 0 {
		t.Error("StartMediaImport must not fire")
	}
}

func TestImportMediaURLHappyPath(t *testing.T) {
	stub := &mediaStub{progressBodies: []string{
		mediaProgress("RUNNING", 5, 10, ""),
		mediaProgress("COMPLETED", 10, 10, ""),
	}}
	setupMediaTest(t, stub)

	cmd := ImportMediaCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runImportMedia(cmd, []string{"https://example.com/up.zip"}); err != nil {
		t.Fatalf("runImportMedia: %v\nstdout: %s", err, stdout.String())
	}
	if !strings.Contains(stdout.String(), "Importing archive from: https://example.com/up.zip") {
		t.Errorf("banner missing: %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "to: example.com (develop)") {
		t.Errorf("domain line missing: %q", stdout.String())
	}
	if stub.startHits.Load() != 1 {
		t.Fatalf("StartMediaImport hits = %d", stub.startHits.Load())
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if !strings.Contains(stub.startReq, `"archiveUrl":"https://example.com/up.zip"`) ||
		!strings.Contains(stub.startReq, `"apiVersion":"v2"`) {
		t.Errorf("start input = %s", stub.startReq)
	}
}

func TestImportMediaLocalArchiveUploadsAndUsesGetObjectURL(t *testing.T) {
	stub := &mediaStub{progressBodies: []string{mediaProgress("COMPLETED", 1, 1, "")}}
	setupMediaTest(t, stub)

	dir := t.TempDir()
	archive := filepath.Join(dir, "uploads.zip")
	content := []byte("PK\x03\x04 fake zip payload")
	if err := os.WriteFile(archive, content, 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := ImportMediaCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runImportMedia(cmd, []string{archive}); err != nil {
		t.Fatalf("runImportMedia: %v\nstdout: %s", err, stdout.String())
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if string(stub.uploadedBody) != string(content) {
		t.Errorf("uploaded body = %q", stub.uploadedBody)
	}
	if !strings.Contains(stub.startReq, `"archiveUrl":"`+stub.srvURL+`/get-me"`) {
		t.Errorf("start input must use the GetObject URL: %s", stub.startReq)
	}
	if !strings.Contains(stdout.String(), "Importing local archive: "+archive+" (uploaded to temporary URL)") {
		t.Errorf("banner missing: %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Upload progress: 100%") {
		t.Errorf("upload progress missing: %q", stdout.String())
	}
}

func TestImportMediaFailedImportExitsOne(t *testing.T) {
	stub := &mediaStub{progressBodies: []string{
		mediaProgress("FAILED", 3, 10,
			`,"failureDetails":{"previousStatus":"RUNNING","globalErrors":["disk full"],"fileErrorsUrl":null}`),
	}}
	setupMediaTest(t, stub)

	cmd := ImportMediaCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	err := runImportMedia(cmd, []string{"https://example.com/up.zip"})
	if err == nil || !strings.Contains(err.Error(), "Import failed at status:") ||
		!strings.Contains(err.Error(), "RUNNING") || !strings.Contains(err.Error(), "disk full") {
		t.Errorf("err = %v", err)
	}
}

func TestImportMediaGraphQLErrorOnStartExitsZero(t *testing.T) {
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()
	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"ImportSQLEnvInfo"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"parityapp","typeId":2,"environments":[
				{"id":7,"appId":42,"type":"develop","name":"develop","launched":false,"isK8sResident":true,
				 "primaryDomain":{"name":"example.com"},
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false},
				 "wpSitesSDS":{"nodes":[]}}]}}}`))
		case strings.Contains(bs, `"operationName":"StartMediaImport"`):
			_, _ = w.Write([]byte(`{"data":null,"errors":[{"message":"another import is running"}]}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL, Token: "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")

	cmd := ImportMediaCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runImportMedia(cmd, []string{"https://example.com/up.zip"}); err != nil {
		t.Fatalf("GraphQL start error must exit 0, got %v", err)
	}
	if !strings.Contains(stdout.String(), "Error:") ||
		!strings.Contains(stdout.String(), "another import is running") {
		t.Errorf("stdout = %q", stdout.String())
	}
}

func TestMediaErrorLogDownload(t *testing.T) {
	stub := &mediaStub{}
	srv := stub.start(t)
	stub.mu.Lock()
	stub.progressBodies = []string{mediaProgress("COMPLETED", 8, 10,
		`,"failureDetails":{"previousStatus":null,"globalErrors":[],"fileErrorsUrl":"`+srv.URL+`/file-errors"}`)}
	stub.mu.Unlock()
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL, Token: "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_IMPORT_MEDIA_INTERVAL_MS", "1")

	// error-log file is written to CWD; isolate it.
	oldWD, _ := os.Getwd()
	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	cmd := ImportMediaStatusCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtxWithType(42, 7, "WordPress"))
	_ = cmd.Flags().Set("saveErrorLog", "true")
	_ = cmd.Flags().Set("exportFileErrorsToJson", "false")

	if err := runImportMediaStatus(cmd, nil); err != nil {
		t.Fatalf("runImportMediaStatus: %v", err)
	}
	matches, _ := filepath.Glob(filepath.Join(tmp, "media-import-parityapp-*.txt"))
	if len(matches) != 1 {
		t.Fatalf("expected one exported error log, got %v", matches)
	}
	content, _ := os.ReadFile(matches[0])
	if !strings.Contains(string(content), "File Name: a.jpg") || !strings.Contains(string(content), "too big") {
		t.Errorf("error log = %q", content)
	}
}

func TestImportMediaStatusUnsupportedApp(t *testing.T) {
	cmd := ImportMediaStatusCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtxWithType(42, 7, "node"))

	err := runImportMediaStatus(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "does not currently support this feature.") {
		t.Errorf("err = %v", err)
	}
}

func TestImportMediaAbortUnsupportedApp(t *testing.T) {
	cmd := ImportMediaAbortCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtxWithType(42, 7, "node"))

	err := runImportMediaAbort(cmd, nil)
	// abort wording differs from status (vip-import-media-abort.js:78)
	if err == nil || !strings.Contains(err.Error(), "does not currently support media file imports.") {
		t.Errorf("err = %v", err)
	}
}

func TestImportMediaAbortHappyPath(t *testing.T) {
	stub := &mediaStub{progressBodies: []string{
		mediaProgress("ABORTING", 3, 10, ""),
		mediaProgress("ABORTED", 3, 10, ""),
	}}
	setupMediaTest(t, stub)

	cmd := ImportMediaAbortCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtxWithType(42, 7, "WordPress"))

	if err := runImportMediaAbort(cmd, nil); err != nil {
		t.Fatalf("runImportMediaAbort: %v", err)
	}
	if stub.abortHits.Load() != 1 {
		t.Errorf("AbortMediaImport hits = %d", stub.abortHits.Load())
	}
}
