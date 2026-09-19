package rechallenge

import (
	"regexp"
	"strings"
)

// jwtInText matches a JSON Web Token by its header segment rather than by the
// generic three-dotted-segments shape.
//
// Every JWT header is base64url-encoded JSON, so it always begins with the
// encoding of `{"` — "eyJ". Anchoring on that is what keeps this usable: the
// unanchored `seg.seg.seg` form that internal/parity uses is fine for a test
// harness, but here it would also swallow ordinary dotted hostnames
// ("parker-service.production.example") out of the very error text we are
// adding for diagnosis. The authoritative protection is the explicit secret
// list below — this pattern is the net for a token we were never handed.
var jwtInText = regexp.MustCompile(`eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*`)

// RedactSecrets strips credentials from server-controlled text before it is
// shown, logged, or shipped.
//
// Every string that passes through here is on its way somewhere durable: the
// user's terminal, a CI log, and cmd/vip-next/main.go's exit hook, which posts
// error text to the telemetry endpoint. Parker echoes request context into some
// error payloads, so a response body can carry back the Authorization header we
// sent it. Pass every credential in scope as a secret; an empty secret is
// ignored so a zero-valued token cannot blank the whole message.
func RedactSecrets(value string, secrets ...string) string {
	for _, secret := range secrets {
		if secret != "" {
			value = strings.ReplaceAll(value, secret, "<redacted>")
		}
	}
	return jwtInText.ReplaceAllString(value, "<redacted-jwt>")
}
