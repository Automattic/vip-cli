package commands

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Khan/genqlient/graphql"
)

// deployStub serves ValidateCustomDeployAccess + StartCustomDeploy +
// presign/S3. Captures the Authorization headers per operation.
type deployStub struct {
	mu            sync.Mutex
	validateAuth  string
	startAuth     string
	startReq      string
	uploadedBody  []byte
	validateFails bool
	srvURL        string
}

func (s *deployStub) start(t *testing.T) *httptest.Server {
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
		case strings.Contains(bs, `"operationName":"ValidateCustomDeployAccess"`):
			s.mu.Lock()
			s.validateAuth = r.Header.Get("Authorization")
			fails := s.validateFails
			s.mu.Unlock()
			if fails {
				_, _ = w.Write([]byte(`{"data":null,"errors":[{"message":"Not found"}]}`))
				return
			}
			_, _ = w.Write([]byte(`{"data":{"validateCustomDeployAccess":{"success":true,"appId":42,"envId":7,
				"envType":"develop","envUniqueLabel":"develop","primaryDomainName":"example.com","launched":false}}}`))
		case strings.Contains(bs, `"operationName":"StartCustomDeploy"`):
			s.mu.Lock()
			s.startAuth = r.Header.Get("Authorization")
			s.startReq = bs
			s.mu.Unlock()
			_, _ = w.Write([]byte(`{"data":{"startCustomDeploy":{"success":true,"message":"queued"}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"url":"%s/s3target","options":{"method":"PUT","headers":{}}}`, s.srvURL)
	})
	mux.HandleFunc("/s3target", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.uploadedBody = body
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	})
	return srv
}

// deployArchive builds a minimal valid .tar.gz (root dir + themes/).
func deployArchive(t *testing.T, name string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	zw := gzip.NewWriter(f)
	tw := tar.NewWriter(zw)
	for _, d := range []string{"app/", "app/themes/"} {
		if err := tw.WriteHeader(&tar.Header{Name: d, Typeflag: tar.TypeDir, Mode: 0o755}); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.WriteHeader(&tar.Header{Name: "app/themes/style.css", Typeflag: tar.TypeReg, Mode: 0o644, Size: 1}); err != nil {
		t.Fatal(err)
	}
	_, _ = tw.Write([]byte("x"))
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return p
}

func newDeployCmd(stub *deployStub, t *testing.T) *bytes.Buffer {
	t.Helper()
	srv := stub.start(t)
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL, Token: "keychain-token",
	})
	t.Cleanup(func() { SetConfig(Config{}) })
	t.Setenv("NO_COLOR", "1")
	return &bytes.Buffer{}
}

func TestAppDeployMissingToken(t *testing.T) {
	stub := &deployStub{}
	_ = newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "")

	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	// AppDeployCmd now registers -a/--app and -e/--env itself (Node parity);
	// the test only needs to set them.
	_ = cmd.Flags().Set("app", "myapp")
	_ = cmd.Flags().Set("env", "develop")
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)

	err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")})
	if err == nil || err.Error() != "Valid custom deploy key is required." {
		t.Errorf("err = %v", err)
	}
}

func TestAppDeployInvalidKey(t *testing.T) {
	stub := &deployStub{validateFails: true}
	_ = newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")

	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	// AppDeployCmd now registers -a/--app and -e/--env itself (Node parity);
	// the test only needs to set them.
	_ = cmd.Flags().Set("app", "myapp")
	_ = cmd.Flags().Set("env", "develop")
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)

	err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")})
	if err == nil || err.Error() != "Unauthorized: Invalid or non-existent custom deploy key for environment." {
		t.Errorf("err = %v", err)
	}
}

func TestAppDeployHappyPath(t *testing.T) {
	stub := &deployStub{}
	out := newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")

	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	// AppDeployCmd now registers -a/--app and -e/--env itself (Node parity);
	// the test only needs to set them.
	_ = cmd.Flags().Set("app", "myapp")
	_ = cmd.Flags().Set("env", "develop")
	cmd.SetOut(out)
	cmd.SetErr(io.Discard)
	_ = cmd.Flags().Set("skip-confirmation", "true")
	_ = cmd.Flags().Set("message", "release notes")

	archive := deployArchive(t, "rel.tar.gz")
	if err := runAppDeploy(cmd, []string{archive}); err != nil {
		t.Fatalf("runAppDeploy: %v\nout: %s", err, out.String())
	}

	stub.mu.Lock()
	defer stub.mu.Unlock()
	// Both mutations must carry the deploy token, not the keychain token.
	if stub.validateAuth != "Bearer deploy-tok" || stub.startAuth != "Bearer deploy-tok" {
		t.Errorf("auth: validate=%q start=%q", stub.validateAuth, stub.startAuth)
	}
	// Basename is date-prefixed (14 digits + dash).
	if !strings.Contains(stub.startReq, `-rel.tar.gz"`) {
		t.Errorf("start input missing date-prefixed basename: %s", stub.startReq)
	}
	if !strings.Contains(stub.startReq, `"deployMessage":"release notes"`) {
		t.Errorf("start input missing message: %s", stub.startReq)
	}
	// sha256 checksum (64 hex chars).
	if !strings.Contains(stub.startReq, `"checksum":"`) {
		t.Errorf("start input missing checksum: %s", stub.startReq)
	}
	content, _ := os.ReadFile(archive) // #nosec G304
	if string(stub.uploadedBody) != string(content) {
		t.Errorf("uploaded body mismatch: %d vs %d bytes", len(stub.uploadedBody), len(content))
	}
	if !strings.Contains(out.String(), "has been sent for deployment to example.com.") ||
		!strings.Contains(out.String(), "https://dashboard.wpvip.com/apps/42/develop/code/deployments") {
		t.Errorf("out = %q", out.String())
	}
}

func TestAppDeployPromptMismatchAborts(t *testing.T) {
	stub := &deployStub{}
	_ = newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")
	restore := stubImportPrompts("WRONG.DOMAIN", true)
	defer restore()

	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	// AppDeployCmd now registers -a/--app and -e/--env itself (Node parity);
	// the test only needs to set them.
	_ = cmd.Flags().Set("app", "myapp")
	_ = cmd.Flags().Set("env", "develop")
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)

	err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")})
	if err == nil || !strings.Contains(err.Error(), "The input did not match the expected environment label. Deploy aborted.") {
		t.Errorf("err = %v", err)
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if stub.startReq != "" {
		t.Error("StartCustomDeploy must not fire after an aborted prompt")
	}
}

func TestAppDeployUncompressedFile(t *testing.T) {
	stub := &deployStub{}
	_ = newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")

	plain := filepath.Join(t.TempDir(), "rel.tgz")
	if err := os.WriteFile(plain, []byte("not actually gzip"), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	// AppDeployCmd now registers -a/--app and -e/--env itself (Node parity);
	// the test only needs to set them.
	_ = cmd.Flags().Set("app", "myapp")
	_ = cmd.Flags().Set("env", "develop")
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)

	err := runAppDeploy(cmd, []string{plain})
	if err == nil || !strings.Contains(err.Error(), "Please compress file") {
		t.Errorf("err = %v", err)
	}
}

func TestAppDeployValidateCleanArchive(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	cmd := AppDeployValidateCmd()
	cmd.SetContext(context.Background())
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(io.Discard)

	if err := runAppDeployValidate(cmd, []string{deployArchive(t, "rel.tar.gz")}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "✓ Compressed file has been successfully validated with no errors.") {
		t.Errorf("out = %q", out.String())
	}
}

func TestAppDeployValidateMissingThemes(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	// Archive without themes/ under root.
	p := filepath.Join(t.TempDir(), "bad.tar.gz")
	f, _ := os.Create(p)
	zw := gzip.NewWriter(f)
	tw := tar.NewWriter(zw)
	_ = tw.WriteHeader(&tar.Header{Name: "app/", Typeflag: tar.TypeDir, Mode: 0o755})
	_ = tw.Close()
	_ = zw.Close()
	_ = f.Close()

	cmd := AppDeployValidateCmd()
	cmd.SetContext(context.Background())
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	err := runAppDeployValidate(cmd, []string{p})
	if err == nil || !strings.Contains(err.Error(), "Missing `themes` directory from root folder.") {
		t.Errorf("err = %v", err)
	}
}
