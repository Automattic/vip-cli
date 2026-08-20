package redact

import (
	"strings"
	"testing"
)

func TestTextStripsURLQueryStrings(t *testing.T) {
	// The presigned URLs vip-next handles — media-import error reports, SQL
	// export downloads, upload presigns — put the credential IN the query
	// string. Possession of the query is the authorisation.
	in := `Get "https://vip-media.s3.amazonaws.com/report.json?X-Amz-Signature=deadbeefcafe&X-Amz-Credential=AKIAEXAMPLE": dial tcp: i/o timeout`
	got := Text(in)

	for _, secret := range []string{"X-Amz-Signature", "deadbeefcafe", "AKIAEXAMPLE"} {
		if strings.Contains(got, secret) {
			t.Errorf("Text kept %q:\n\t%s", secret, got)
		}
	}
	// The diagnosable parts must survive: which host, which object, what failed.
	for _, keep := range []string{"vip-media.s3.amazonaws.com", "report.json", "i/o timeout"} {
		if !strings.Contains(got, keep) {
			t.Errorf("Text dropped %q, which the report needs to stay useful:\n\t%s", keep, got)
		}
	}
}

func TestTextStripsURLUserinfo(t *testing.T) {
	got := Text("SOCKS proxy socks5://alice:hunter2@proxy.corp.example:1080 has no host")
	if strings.Contains(got, "hunter2") || strings.Contains(got, "alice") {
		t.Errorf("Text kept proxy credentials:\n\t%s", got)
	}
	if !strings.Contains(got, "proxy.corp.example:1080") {
		t.Errorf("Text dropped the proxy host, which the user needs to fix their config:\n\t%s", got)
	}
}

func TestTextStripsJWTs(t *testing.T) {
	jwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	got := Text("token rejected: " + jwt)
	if strings.Contains(got, jwt) || strings.Contains(got, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9") {
		t.Errorf("Text kept a JWT:\n\t%s", got)
	}
	if !strings.Contains(got, "token rejected") {
		t.Errorf("Text dropped the surrounding message:\n\t%s", got)
	}
}

func TestTextStripsBearerTokens(t *testing.T) {
	got := Text("request failed with header Authorization: Bearer abc123SECRETvalue.and-more")
	if strings.Contains(got, "abc123SECRETvalue") {
		t.Errorf("Text kept a bearer token:\n\t%s", got)
	}
}

// TestTextLeavesOrdinaryMessagesAlone is the counterweight. A scrubber that
// mangles every message is one people will disable. Hostnames in particular
// look JWT-ish to a naive `a.b.c` regex — internal/parity's RedactSecrets uses
// exactly such a pattern, and it would eat "public-api.wordpress.com".
func TestTextLeavesOrdinaryMessagesAlone(t *testing.T) {
	for _, msg := range []string{
		"failed to reach public-api.wordpress.com: connection refused",
		"environment my-site is not running; run `vip dev-env start`",
		"GraphQL error: You do not have permission to access this application",
		"open versions.json: no such file or directory",
		"https://api.wpvip.com/graphql returned 502",
	} {
		if got := Text(msg); got != msg {
			t.Errorf("Text rewrote an innocuous message:\n\tin:  %s\n\tout: %s", msg, got)
		}
	}
}

func TestTextIsIdempotent(t *testing.T) {
	in := `Get "https://example.com/a?sig=abc": refused`
	once := Text(in)
	if twice := Text(once); twice != once {
		t.Errorf("Text is not idempotent:\n\t1x: %s\n\t2x: %s", once, twice)
	}
}
