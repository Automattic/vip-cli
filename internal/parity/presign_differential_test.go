//go:build parity

package parity

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	json "encoding/json/v2"

	"github.com/Automattic/vip/internal/upload"
)

// This script loads the real compiled uploader and HTTP helper. Only Token.get
// is stubbed: the helper calls it even when WPVIP_DEPLOY_TOKEN has already set
// Authorization, and a differential test must never inspect the host keychain.
const presignNodeScript = `
const tokenPath = require.resolve(process.argv[1].replace(/client-file-uploader\.js$/, 'token.js'));
require.cache[tokenPath] = {
  id: tokenPath, filename: tokenPath, loaded: true,
  exports: { __esModule: true, default: { get: async () => ({ raw: 'unused-test-token' }) } },
};
const { getSignedUploadRequestData } = require(process.argv[1]);
getSignedUploadRequestData(JSON.parse(process.argv[2])).then(
  value => process.stdout.write(JSON.stringify({ ok: true, value })),
  error => process.stdout.write(JSON.stringify({ ok: false, error: String(error.message) }))
);
`

type presignReply struct {
	status    int
	body      string
	truncated bool
}

type presignObservation struct {
	method      string
	path        string
	authorize   string
	contentType string
	body        string
}

type presignResult struct {
	OK    bool           `json:"ok"`
	Value map[string]any `json:"value"`
	Error string         `json:"error"`
}

const presignSuccess = `{"url":"https://storage.example.test/object","options":{"method":"PUT","headers":{"X-Amz-Meta-Test":"yes"}}}`
const presignToken = "parity-presign-token"

func presignFixture(t *testing.T, replies []presignReply) (*httptest.Server, func() []presignObservation) {
	t.Helper()
	var mu sync.Mutex
	var requests []presignObservation
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read request body: %v", err)
		}
		mu.Lock()
		requests = append(requests, presignObservation{
			method: r.Method, path: r.URL.Path, authorize: r.Header.Get("Authorization"),
			contentType: r.Header.Get("Content-Type"), body: string(body),
		})
		index := len(requests) - 1
		mu.Unlock()
		if index >= len(replies) {
			t.Errorf("unexpected request %d", index+1)
			w.WriteHeader(http.StatusTeapot)
			return
		}
		reply := replies[index]
		if reply.truncated {
			conn, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Errorf("hijack response: %v", err)
				return
			}
			// A complete HTTP 200 header and short JSON body force a response-body
			// transport error; malformed but complete JSON exercises a different path.
			_, _ = fmt.Fprintf(conn, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s", len(reply.body)+20, reply.body)
			_ = conn.Close()
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(reply.status)
		_, _ = io.WriteString(w, reply.body)
	}))
	return srv, func() []presignObservation {
		mu.Lock()
		defer mu.Unlock()
		return append([]presignObservation(nil), requests...)
	}
}

func presignNode(t *testing.T, modulePath, host string, args upload.SignedRequestArgs) presignResult {
	t.Helper()
	encoded, err := json.Marshal(args)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "-e", presignNodeScript, modulePath, string(encoded))
	cmd.Env = FixtureEnv(map[string]string{
		"API_HOST": host, "WPVIP_DEPLOY_TOKEN": presignToken,
		"HOME": t.TempDir(), "XDG_CONFIG_HOME": t.TempDir(),
	})
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Node presign: %v: %s", err, out)
	}
	var result presignResult
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatalf("decode Node result %q: %v", out, err)
	}
	return result
}

func presignGo(t *testing.T, srv *httptest.Server, args upload.SignedRequestArgs) presignResult {
	t.Helper()
	t.Setenv("WPVIP_DEPLOY_TOKEN", presignToken)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	client := &upload.Client{APIHost: srv.URL, Token: "unused-test-token", HTTPClient: srv.Client()}
	value, err := client.GetSignedUploadRequestData(ctx, args)
	if err != nil {
		return presignResult{Error: err.Error()}
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(encoded, &parsed); err != nil {
		t.Fatal(err)
	}
	return presignResult{OK: true, Value: parsed}
}

func presignCheckRequests(t *testing.T, runtime string, observed []presignObservation, args upload.SignedRequestArgs, want int) {
	t.Helper()
	if len(observed) != want {
		t.Errorf("%s attempts = %d, want %d", runtime, len(observed), want)
	}
	encoded, err := json.Marshal(args)
	if err != nil {
		t.Fatal(err)
	}
	var expected map[string]any
	if err := json.Unmarshal(encoded, &expected); err != nil {
		t.Fatal(err)
	}
	for i, request := range observed {
		if request.method != http.MethodPost || request.path != "/upload/site-import-presigned-url" ||
			request.authorize != "Bearer "+presignToken || request.contentType != "application/json" {
			t.Errorf("%s attempt %d request metadata = %+v", runtime, i+1, request)
		}
		var body map[string]any
		if err := json.Unmarshal([]byte(request.body), &body); err != nil {
			t.Errorf("%s attempt %d body: %v", runtime, i+1, err)
		} else if !reflect.DeepEqual(body, expected) {
			t.Errorf("%s attempt %d body = %#v, want %#v", runtime, i+1, body, expected)
		}
		if i > 0 && request.body != observed[0].body {
			t.Errorf("%s attempt %d did not replay identical request body", runtime, i+1)
		}
	}
}

func TestPresignedRequestDifferential(t *testing.T) {
	modulePath, err := filepath.Abs("../../dist/lib/client-file-uploader.js")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip(LoudSkip("presigned-request differential", "node is unavailable"))
	}
	if _, err := os.Stat(modulePath); err != nil {
		t.Skip(LoudSkip("presigned-request differential", "compiled Node uploader is unavailable; run npm run build"))
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(modulePath), "..", "..", "node_modules", "undici")); err != nil {
		t.Skip(LoudSkip("presigned-request differential", "Node dependencies are unavailable; run npm ci"))
	}

	args := upload.SignedRequestArgs{
		Action: "UploadPart", AppID: 42, EnvID: 7, BaseName: "archive with spaces.sql.gz",
		PartNumber: 3, UploadID: "upload-123",
	}
	cases := []struct {
		name    string
		replies []presignReply
		wantOK  bool
		wantErr string
	}{
		{"429 then success", []presignReply{{status: 429, body: "slow down"}, {status: 200, body: presignSuccess}}, true, ""},
		{"503 then success", []presignReply{{status: 503, body: "unavailable"}, {status: 200, body: presignSuccess}}, true, ""},
		{"truncated 200 then success", []presignReply{{truncated: true, body: `{"url":`}, {status: 200, body: presignSuccess}}, true, ""},
		{"truncated 200 exhaustion", []presignReply{{truncated: true, body: `{"url":`}, {truncated: true, body: `{"url":`}, {truncated: true, body: `{"url":`}, {truncated: true, body: `{"url":`}}, false, ""},
		{"complete malformed JSON", []presignReply{{status: 200, body: `{"url":`}}, false, ""},
		{"403 does not retry", []presignReply{{status: 403, body: "forbidden"}}, false, "forbidden"},
		{"503 exhaustion", []presignReply{{status: 503, body: "unavailable"}, {status: 503, body: "unavailable"}, {status: 503, body: "unavailable"}, {status: 503, body: "unavailable"}}, false, "unavailable"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			nodeServer, nodeSnapshot := presignFixture(t, tc.replies)
			defer nodeServer.Close()
			nodeResult := presignNode(t, modulePath, nodeServer.URL, args)
			nodeRequests := nodeSnapshot()

			goServer, goSnapshot := presignFixture(t, tc.replies)
			defer goServer.Close()
			goResult := presignGo(t, goServer, args)
			goRequests := goSnapshot()

			presignCheckRequests(t, "Node", nodeRequests, args, len(tc.replies))
			presignCheckRequests(t, "Go", goRequests, args, len(tc.replies))
			if len(nodeRequests) != len(goRequests) {
				t.Errorf("attempt mismatch: Node=%d Go=%d", len(nodeRequests), len(goRequests))
			}
			if nodeResult.OK != tc.wantOK || goResult.OK != tc.wantOK {
				t.Errorf("outcome mismatch: Node=%+v Go=%+v, want success=%v", nodeResult, goResult, tc.wantOK)
			}
			if tc.wantOK && !reflect.DeepEqual(nodeResult.Value, goResult.Value) {
				t.Errorf("result mismatch: Node=%#v Go=%#v", nodeResult.Value, goResult.Value)
			}
			if !tc.wantOK {
				if nodeResult.Error == "" || goResult.Error == "" {
					t.Errorf("missing failure: Node=%+v Go=%+v", nodeResult, goResult)
				}
				if tc.wantErr != "" && (!strings.Contains(nodeResult.Error, tc.wantErr) || !strings.Contains(goResult.Error, tc.wantErr)) {
					t.Errorf("error mismatch: Node=%q Go=%q, want %q", nodeResult.Error, goResult.Error, tc.wantErr)
				}
			}
		})
	}
}
