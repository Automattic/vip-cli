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
	"github.com/spf13/cobra"
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
	uploadCount   int
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
			if strings.Contains(bs, `"env":"production"`) {
				_, _ = w.Write([]byte(`{"data":{"validateCustomDeployAccess":{"success":true,"appId":42,"envId":8,
				"envType":"production","envUniqueLabel":"production","primaryDomainName":"prod.example.com","launched":true}}}`))
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
		s.uploadCount++
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

func TestParseDeployTargets(t *testing.T) {
	cases := []struct {
		name     string
		to       []string
		app, env string
		want     []deployTarget
		wantErr  string
	}{
		{name: "no --to falls back to --app/--env", app: "myapp", env: "develop",
			want: []deployTarget{{app: "myapp", env: "develop"}}},
		{name: "repeated, comma-separated, duplicate", to: []string{"Example-App.production", "other-app.develop,example-app.production"},
			want: []deployTarget{{app: "example-app", env: "production"}, {app: "other-app", env: "develop"}}},
		{name: "instance suffix", to: []string{"app.develop.instance-01"},
			want: []deployTarget{{app: "app", env: "develop.instance-01"}}},
		{name: "missing env", to: []string{"example-app"}, wantErr: deployTargetFormatError},
		{name: "missing app", to: []string{".develop"}, wantErr: deployTargetFormatError},
		{name: "trailing dot", to: []string{"example-app."}, wantErr: deployTargetFormatError},
		{name: "bad chars", to: []string{"app/x.develop"}, wantErr: deployTargetFormatError},
		{name: "empty", to: []string{""}, wantErr: deployTargetFormatError},
		{name: "conflict with --app", to: []string{"a.develop"}, app: "x", wantErr: deployTargetConflictError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd := AppDeployCmd()
			if tc.app != "" {
				_ = cmd.Flags().Set("app", tc.app)
			}
			if tc.env != "" {
				_ = cmd.Flags().Set("env", tc.env)
			}
			for _, v := range tc.to {
				_ = cmd.Flags().Set("to", v)
			}
			got, err := parseDeployTargets(cmd)
			if tc.wantErr != "" {
				if err == nil || err.Error() != tc.wantErr {
					t.Fatalf("err = %v, want %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if fmt.Sprint(got) != fmt.Sprint(tc.want) {
				t.Errorf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

// newMultiTargetDeploy wires a stub API, a deploy token, and a command with
// the given --to values.
func newMultiTargetDeploy(t *testing.T, stub *deployStub, to ...string) (*cobra.Command, *bytes.Buffer) {
	t.Helper()
	out := newDeployCmd(stub, t)
	t.Setenv("WPVIP_DEPLOY_TOKEN", "deploy-tok")
	cmd := AppDeployCmd()
	cmd.SetContext(context.Background())
	for _, v := range to {
		_ = cmd.Flags().Set("to", v)
	}
	cmd.SetOut(out)
	cmd.SetErr(io.Discard)
	return cmd, out
}

func TestAppDeployMultiTargetSingleUploadAndEnvironmentIds(t *testing.T) {
	stub := &deployStub{}
	cmd, out := newMultiTargetDeploy(t, stub, "myapp.develop", "myapp.production")
	_ = cmd.Flags().Set("skip-confirmation", "true")

	if err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")}); err != nil {
		t.Fatalf("runAppDeploy: %v\nout: %s", err, out.String())
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if stub.uploadCount != 1 {
		t.Errorf("uploads = %d, want 1", stub.uploadCount)
	}
	if !strings.Contains(stub.startReq, `"environmentIds":[7,8]`) || !strings.Contains(stub.startReq, `"environmentId":null`) {
		t.Errorf("start input = %s", stub.startReq)
	}
	for _, want := range []string{
		"has been sent for deployment to 2 environments.",
		"example.com: https://dashboard.wpvip.com/apps/42/develop/code/deployments",
		"prod.example.com: https://dashboard.wpvip.com/apps/42/production/code/deployments",
	} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("out missing %q:\n%s", want, out.String())
		}
	}
}

func TestAppDeploySingleTargetKeepsEnvironmentId(t *testing.T) {
	stub := &deployStub{}
	// Two names for the same environment collapse to one deploy.
	cmd, _ := newMultiTargetDeploy(t, stub, "myapp.develop", "42.develop")
	_ = cmd.Flags().Set("skip-confirmation", "true")

	if err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")}); err != nil {
		t.Fatalf("runAppDeploy: %v", err)
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if !strings.Contains(stub.startReq, `"environmentId":7`) || !strings.Contains(stub.startReq, `"environmentIds":null`) {
		t.Errorf("start input = %s", stub.startReq)
	}
}

func TestAppDeployMultiTargetRejectedConfirmationDeploysNothing(t *testing.T) {
	stub := &deployStub{}
	cmd, _ := newMultiTargetDeploy(t, stub, "myapp.develop", "myapp.production")
	restore := stubImportPrompts("WRONG.DOMAIN", true)
	defer restore()

	err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")})
	if err == nil || !strings.Contains(err.Error(), "Deploy aborted.") {
		t.Errorf("err = %v", err)
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if stub.uploadCount != 0 || stub.startReq != "" {
		t.Errorf("uploads=%d start=%q; want nothing", stub.uploadCount, stub.startReq)
	}
}

func TestAppDeployMultiTargetInvalidKeyNamesTarget(t *testing.T) {
	cmd, _ := newMultiTargetDeploy(t, &deployStub{validateFails: true}, "myapp.develop", "myapp.production")
	err := runAppDeploy(cmd, []string{deployArchive(t, "rel.tar.gz")})
	if err == nil || err.Error() != "Unauthorized: Invalid or non-existent custom deploy key for environment myapp.develop." {
		t.Errorf("err = %v", err)
	}
}
