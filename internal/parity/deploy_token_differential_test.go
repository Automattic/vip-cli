//go:build parity

package parity

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// Exercise the actual entrypoints: a deploy-specific client test misses the
// bootstrap middleware and Node's shared HTTP helper that caused this regression.
func TestDeployTokenIndependentOfEnvironmentPAT(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip(t.Name(), skip))
	}
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	for _, h := range []*tar.Header{
		{Name: "app/", Typeflag: tar.TypeDir, Mode: 0755},
		{Name: "app/themes/", Typeflag: tar.TypeDir, Mode: 0755},
		{Name: "app/themes/style.css", Mode: 0644, Size: 1},
	} {
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tw.Write([]byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "deploy.tar.gz")
	if err := os.WriteFile(path, archive.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	checksum := fmt.Sprintf("%x", sha256.Sum256(archive.Bytes()))
	cases := []struct {
		name, pat, failAt string
		stored            bool
	}{
		{name: "absent"}, {name: "blank", pat: "   "}, {name: "valid", pat: validEnvironmentFixtureToken(t)},
		{name: "stored", stored: true},
		{name: "malformed", pat: "not-a-jwt"},
		{name: "expired", pat: environmentFixtureToken(t, map[string]any{"id": 84, "iat": time.Now().Add(-2 * time.Hour).Unix(), "exp": time.Now().Add(-time.Hour).Unix()})},
		{name: "rejected-deploy-token", pat: validEnvironmentFixtureToken(t), failAt: "ValidateCustomDeployAccess"},
		{name: "rejected-upload", pat: "not-a-jwt", failAt: "presign"},
		{name: "rejected-deployment", pat: "not-a-jwt", failAt: "StartCustomDeploy"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, runtime := range []struct{ name, bin string }{{"node", rig.nodeBin}, {"go", rig.goBin}} {
				t.Run(runtime.name, func(t *testing.T) {
					var mu sync.Mutex
					var steps []string
					var presign map[string]any
					var deploy map[string]any
					srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						mu.Lock()
						defer mu.Unlock()
						w.Header().Set("Content-Type", "application/json")
						body, err := io.ReadAll(r.Body)
						if err != nil {
							t.Error(err)
							return
						}
						if r.URL.Path == "/s3target" {
							steps = append(steps, "upload")
							if r.Method != "PUT" || r.Header.Get("Authorization") != "" || !bytes.Equal(body, archive.Bytes()) {
								t.Error("upload method, credentials, or archive bytes changed")
							}
							return
						}
						if r.Header.Get("Authorization") != "Bearer deploy-fixture" {
							t.Error("API request did not use deploy token")
						}
						if r.Method != "POST" {
							t.Errorf("unexpected method %s", r.Method)
						}
						switch r.URL.Path {
						case "/graphql":
							var op struct {
								OperationName string         `json:"operationName"`
								Variables     map[string]any `json:"variables"`
							}
							if err := json.Unmarshal(body, &op); err != nil {
								t.Error(err)
								return
							}
							steps = append(steps, op.OperationName)
							if tc.failAt == op.OperationName {
								w.WriteHeader(http.StatusUnauthorized)
								fmt.Fprint(w, `{}`)
								return
							}
							switch op.OperationName {
							case "ValidateCustomDeployAccess":
								fmt.Fprint(w, `{"data":{"validateCustomDeployAccess":{"success":true,"appId":42,"envId":7,"envType":"develop","envUniqueLabel":"develop","primaryDomainName":"example.com","launched":false}}}`)
							case "StartCustomDeploy":
								deploy = op.Variables
								fmt.Fprint(w, `{"data":{"startCustomDeploy":{"success":true,"message":"queued"}}}`)
							default:
								t.Errorf("unexpected GraphQL operation %s", op.OperationName)
								w.WriteHeader(500)
							}
						case "/upload/site-import-presigned-url":
							steps = append(steps, "presign")
							if tc.failAt == "presign" {
								w.WriteHeader(http.StatusUnauthorized)
								fmt.Fprint(w, `{}`)
								return
							}
							if err := json.Unmarshal(body, &presign); err != nil {
								t.Error(err)
							}
							fmt.Fprintf(w, `{"url":"http://%s/s3target","options":{"method":"PUT","headers":{}}}`, r.Host)
						default:
							t.Errorf("unexpected request path %s", r.URL.Path)
							w.WriteHeader(404)
						}
					}))
					defer srv.Close()
					t.Cleanup(func() {
						if err := cleanupStoredCredentials(rig.nodeBin, srv.URL); err != nil {
							t.Error(err)
						}
					})
					if tc.stored {
						if err := SeedNodeKeychainToken(rig.nodeBin, srv.URL, rig.token); err != nil {
							t.Fatal(err)
						}
						if err := goKeychainOp(srv.URL, "seed", rig.token); err != nil {
							t.Fatal(err)
						}
					}
					overrides := map[string]string{"API_HOST": srv.URL, "WPVIP_DEPLOY_TOKEN": "deploy-fixture", "VIP_CLI_TOKEN": ""}
					if tc.name != "absent" {
						overrides["VIP_CLI_TOKEN"] = tc.pat
					}
					env := FixtureEnv(overrides)
					if tc.name == "absent" {
						env = slices.DeleteFunc(env, func(v string) bool { return strings.HasPrefix(v, "VIP_CLI_TOKEN=") })
					}
					args := []string{"app", "deploy", path, "--app=parityapp", "--env=develop", "--message=CI release"}
					args = append(args, "--skip-confirmation")
					result, err := Run(RunSpec{Binary: runtime.bin, Argv: args, Env: env})
					if err != nil {
						t.Fatal(err)
					}
					mu.Lock()
					defer mu.Unlock()
					wantSteps := []string{"ValidateCustomDeployAccess", "presign", "upload", "StartCustomDeploy"}
					if tc.failAt != "" {
						count := slices.Index(wantSteps, tc.failAt) + 1
						if result.ExitCode == 0 || strings.Contains(result.Stdout, "has been sent for deployment") || strings.Contains(result.Stderr, "VIP_CLI_TOKEN") {
							t.Fatalf("failure mishandled: exit=%d stdout=%q stderr=%q", result.ExitCode, result.Stdout, result.Stderr)
						}
						if !reflect.DeepEqual(steps, wantSteps[:count]) {
							t.Fatalf("failure continued, retried, or fell back to PAT: %v", steps)
						}
						return
					}
					if result.ExitCode != 0 || !strings.Contains(result.Stdout, "has been sent for deployment") {
						t.Fatalf("exit=%d stdout=%q stderr=%q", result.ExitCode, result.Stdout, result.Stderr)
					}
					if !reflect.DeepEqual(steps, []string{"ValidateCustomDeployAccess", "presign", "upload", "StartCustomDeploy"}) {
						t.Fatalf("unexpected deployment sequence: %v", steps)
					}
					input, ok := deploy["input"].(map[string]any)
					if !ok {
						t.Fatalf("missing deployment input: %v", deploy)
					}
					if input["id"] != float64(42) || input["environmentId"] != float64(7) || input["checksum"] != checksum || input["deployMessage"] != "CI release" || input["basename"] != presign["basename"] {
						t.Errorf("deployment payload changed: %v; presign: %v", input, presign)
					}
					if presign["appId"] != float64(42) || presign["envId"] != float64(7) {
						t.Errorf("wrong upload target: %v", presign)
					}
				})
			}
		})
	}
}
