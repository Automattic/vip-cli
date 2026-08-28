package httpproxy

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// tokenBearingSources are the production files whose requests carry a VIP
// credential — a keychain bearer token, a WPVIP_DEPLOY_TOKEN, or a presigned URL
// whose query string is itself the credential. Every one of them must build its
// client from this package.
//
// http.DefaultClient and http.DefaultTransport are the failure mode: they apply
// http.ProxyFromEnvironment, which is the exact inversion of Node's policy —
// HTTPS_PROXY is honoured without the VIP_USE_SYSTEM_PROXY opt-in, and
// VIP_PROXY/SOCKS_PROXY are ignored. The behavioural proofs live in
// httpproxy_test.go, internal/gql/proxy_test.go and internal/upload/proxy_test.go;
// this list is the cheap guard that stops a seventh call site being added
// without one.
//
// TestNoProductionCodeBuildsAnUnproxiedHTTPClient is the complement: this list
// is opt-IN (these named files must reach for the package), that scan is
// opt-OUT (no file anywhere may build a client the package did not vend).
var tokenBearingSources = []string{
	"../gql/client.go",
	"../upload/presign.go",
	"../auth/logout.go",
	"../rechallenge/client.go",
	"../wpstream/engineio.go",
	"../sqlexport/download.go",
	"../telemetry/tracks.go",
	"../telemetry/pendo.go",
}

func TestTokenBearingClientsDoNotUseTheDefaultTransport(t *testing.T) {
	for _, rel := range tokenBearingSources {
		src, err := os.ReadFile(filepath.Clean(rel))
		if err != nil {
			t.Errorf("read %s: %v (did the file move? update tokenBearingSources)", rel, err)
			continue
		}
		// A bare &http.Client{} is just as wrong — it inherits
		// http.DefaultTransport's proxy policy — and is not greppable, so
		// require the file to reach for this package explicitly.
		if !strings.Contains(string(src), "httpproxy.") {
			t.Errorf("%s never calls into internal/httpproxy; an http.Client built without "+
				"an explicit Transport inherits http.DefaultTransport's proxy policy", rel)
		}
		for _, banned := range []string{"http.DefaultClient", "http.DefaultTransport"} {
			for _, line := range strings.Split(string(src), "\n") {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "//") {
					continue // prose may name it
				}
				if strings.Contains(trimmed, banned) {
					t.Errorf("%s uses %s; use httpproxy.Client()/Transport() so VIP_PROXY is "+
						"honoured and HTTPS_PROXY is not honoured without VIP_USE_SYSTEM_PROXY\n\t%s",
						rel, banned, trimmed)
				}
			}
		}
	}
}

// unproxiedConstructors are the ways production code can end up on
// http.DefaultTransport's proxy policy — the inverse of Node's.
//
// http.Get/Head/Post/PostForm are http.DefaultClient in disguise. A
// `&http.Client{...}` literal with no Transport field is the same thing with a
// timeout bolted on, which is what made the four call sites this scan was
// written for look deliberate.
var unproxiedConstructors = []string{
	"http.DefaultClient",
	"http.DefaultTransport",
	"http.Get(",
	"http.Head(",
	"http.Post(",
	"http.PostForm(",
}

// scanExemptDirs are the trees the scan does not walk.
//
//   - internal/httpproxy is the package that vends the sanctioned constructors;
//     it necessarily names http.DefaultTransport in order to clone it.
//   - internal/parity is the differential-test harness, gated behind
//     `//go:build parity`. It deliberately talks to a local Parker with its own
//     client, and its whole point is ambient independence — the Makefile scrubs
//     every proxy variable before running it.
var scanExemptDirs = []string{
	filepath.Join("internal", "httpproxy"),
	filepath.Join("internal", "parity"),
}

// TestNoProductionCodeBuildsAnUnproxiedHTTPClient walks every non-test Go file
// under internal/ and cmd/ and fails on any HTTP client that did not come from
// this package.
//
// tokenBearingSources could only ever catch a regression in a file someone had
// already thought about. This scan catches the file nobody thought about: at
// the commit it was written it found four live call sites on
// http.DefaultTransport, one of them (the WordPress version manifest) a request
// Node explicitly routes through createProxyAgent.
func TestNoProductionCodeBuildsAnUnproxiedHTTPClient(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	for _, tree := range []string{"internal", "cmd"} {
		walkGoSources(t, filepath.Join(root, tree), root, func(rel string, src []byte) {
			for _, line := range codeLines(string(src)) {
				for _, banned := range unproxiedConstructors {
					if strings.Contains(line.text, banned) {
						t.Errorf("%s:%d builds an HTTP client on http.DefaultTransport's proxy "+
							"policy via %s. Use httpproxy.Client()/ClientWithTimeout() so VIP_PROXY is "+
							"honoured and HTTPS_PROXY is not honoured without VIP_USE_SYSTEM_PROXY; use "+
							"httpproxy.DirectClientWithTimeout() when the target is the user's own "+
							"machine and must never be proxied.\n\t%s",
							rel, line.num, banned, line.text)
					}
				}
				if lit, ok := clientLiteral(line.text); ok && !strings.Contains(lit, "Transport:") {
					t.Errorf("%s:%d constructs http.Client with no Transport, so it inherits "+
						"http.DefaultTransport's proxy policy. Use httpproxy.ClientWithTimeout() "+
						"(or DirectClientWithTimeout() for the user's own machine).\n\t%s",
						rel, line.num, line.text)
				}
			}
		})
	}
}

type sourceLine struct {
	num  int
	text string
}

// codeLines drops whole-line comments so prose may name the banned symbols —
// several files explain at length why they are NOT using http.DefaultClient.
func codeLines(src string) []sourceLine {
	var out []sourceLine
	for i, raw := range strings.Split(src, "\n") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "//") {
			continue
		}
		out = append(out, sourceLine{num: i + 1, text: trimmed})
	}
	return out
}

// clientLiteral returns the body of an `http.Client{...}` composite literal
// starting on this line, up to the matching brace. A multi-line literal is
// truncated at end of line, which errs in the safe direction: one whose
// Transport field sits on a later line reports a false positive rather than
// letting a real unproxied client through.
func clientLiteral(line string) (string, bool) {
	idx := strings.Index(line, "http.Client{")
	if idx < 0 {
		return "", false
	}
	rest := line[idx+len("http.Client"):]
	depth := 0
	for i, r := range rest {
		switch r {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return rest[:i+1], true
			}
		}
	}
	return rest, true
}

func walkGoSources(t *testing.T, dir, root string, fn func(rel string, src []byte)) {
	t.Helper()
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		if d.IsDir() {
			for _, skip := range scanExemptDirs {
				if rel == skip {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, readErr := os.ReadFile(filepath.Clean(path))
		if readErr != nil {
			return readErr
		}
		fn(rel, src)
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", dir, err)
	}
}
