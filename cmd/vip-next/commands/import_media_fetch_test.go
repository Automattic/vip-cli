package commands

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// signedQuery is the shape of the credential the media-import file-errors URL
// carries. The URL is presigned: possession of the query string IS the
// authorisation to download the report.
const signedQuery = "?X-Amz-Signature=deadbeefcafe0123456789abcdef&X-Amz-Credential=AKIAEXAMPLE%2Fus-east-1"

// TestFetchFailureDetailsHonoursVIPProxy pins the file-errors download to
// vip-next's proxy policy.
//
// Node's fetchFailureDetails (src/lib/media-import/status.ts:296) uses a bare
// node-fetch call, which reads no proxy environment at all, so Node connects
// direct. Go was on http.DefaultTransport, which is not "direct": it honours an
// ambient HTTPS_PROXY without the VIP_USE_SYSTEM_PROXY opt-in while ignoring
// VIP_PROXY. Neither is what the user asked for. Routing it through the shared
// policy makes VIP_PROXY work (a deliberate, reported divergence from Node,
// which cannot download this report from behind a SOCKS-only network at all)
// and makes the un-opted-in HTTPS_PROXY case behave like Node's direct connect.
//
// The stdlib precondition is what stops this passing vacuously: the target is a
// loopback server, and no stdlib resolver ever proxies loopback, so before the
// fix this fetch succeeded.
func TestFetchFailureDetailsHonoursVIPProxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	clearProxyEnvVars(t)
	t.Setenv("VIP_PROXY", "socks5://"+closedLoopback(t))

	target := srv.URL + "/errors.json" + signedQuery
	assertNoStdlibProxy(t, target)

	if _, err := fetchFailureDetails(target); err == nil {
		t.Fatal("fetchFailureDetails succeeded; VIP_PROXY was ignored and the request went direct")
	}
}

// TestFetchFailureDetailsErrorDoesNotLeakThePresignedURL is the privacy half,
// and the reason this call site needed more than a proxy swap.
//
// http.Get returns a *url.Error whose Error() embeds the full request URL,
// signature query string and all. That error is RETURNED, so it reaches
// exit.WithError and, from there, the Go-only cli_error telemetry hook — which
// ships the text to public-api.wordpress.com. A live download credential for a
// customer's media-import error report would have left the machine on every
// failed fetch. This is the same class of leak the proxy-credential redaction
// in internal/httpproxy already closed at its own source.
func TestFetchFailureDetailsErrorDoesNotLeakThePresignedURL(t *testing.T) {
	clearProxyEnvVars(t)

	// A closed port: the fetch fails inside net/http, which is where the
	// URL-bearing *url.Error is minted.
	target := "http://" + closedLoopback(t) + "/errors.json" + signedQuery

	_, err := fetchFailureDetails(target)
	if err == nil {
		t.Fatal("precondition failed: the fetch should not have succeeded against a closed port")
	}
	for _, secret := range []string{"X-Amz-Signature", "deadbeefcafe0123456789abcdef", "AKIAEXAMPLE"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("error text carries the presigned credential %q off-box via the cli_error "+
				"telemetry hook:\n\t%s", secret, err.Error())
		}
	}
	if !strings.Contains(err.Error(), "errors.json") {
		t.Errorf("error text lost the path too; it should stay diagnosable:\n\t%s", err.Error())
	}
}

// TestFetchFailureDetailsParsesTheReport keeps the happy path honest: the
// hardening must not stop a real report being read.
func TestFetchFailureDetailsParsesTheReport(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"fileName":"a.jpg","errors":["boom"]}]`))
	}))
	defer srv.Close()

	clearProxyEnvVars(t)

	got, err := fetchFailureDetails(srv.URL + "/errors.json" + signedQuery)
	if err != nil {
		t.Fatalf("fetchFailureDetails: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d file errors, want 1", len(got))
	}
}
