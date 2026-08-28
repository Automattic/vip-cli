// Package redact removes credentials from text that is about to leave the
// process — an error message printed to a shared terminal, written to a log
// file, or, in vip-next's case, shipped to an analytics endpoint by the
// cli_error telemetry hook.
//
// It is the production counterpart of internal/parity's RedactSecrets, which is
// test-only and takes the secrets it should remove as arguments. Here the
// secrets are not known in advance: they arrive inside error strings minted by
// net/http, which embeds the full request URL — query string and all — in every
// *url.Error it returns.
//
// The design constraint is that this must be safe to apply unconditionally. A
// scrubber that mangles ordinary messages produces unreadable errors and gets
// switched off, so every rule here is anchored on a shape that does not occur
// in prose: a URL's query or userinfo, a JWT's "eyJ" header prefix, an explicit
// Bearer keyword.
package redact

import (
	"net/url"
	"regexp"
	"strings"
)

const (
	placeholderQuery    = "<redacted>"
	placeholderUserinfo = "xxxxx"
	placeholderJWT      = "<redacted-jwt>"
)

// urlRE matches an absolute URL up to the first character that cannot appear in
// one unescaped. Quotes are terminators because net/http quotes the URL in
// *url.Error: `Get "https://…": dial tcp …`.
var urlRE = regexp.MustCompile(`[a-zA-Z][a-zA-Z0-9+.\-]*://[^\s"'` + "`" + `<>]+`)

// jwtRE is anchored on "eyJ", the base64 of `{"` that opens every JWT header.
//
// The looser `<8+>.<8+>.<any>` shape internal/parity uses is wrong for
// production text: it matches hostnames. "public-api.wordpress.com" satisfies
// it, and redacting the API host out of every network error would make the
// telemetry useless and the local message baffling.
var jwtRE = regexp.MustCompile(`eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?`)

// bearerRE catches a token that reached the message through a header dump
// rather than a URL.
var bearerRE = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}`)

// trailingPunctuation is stripped from a URL match before parsing and restored
// after, so "see https://x/y?t=1." does not fold the sentence's full stop into
// the URL.
const trailingPunctuation = `.,;:!)]}`

// Text returns s with every credential-shaped substring replaced.
//
// Removed: URL query strings (where presigned credentials live), URL userinfo
// (proxy passwords), URL fragments (implicit-flow tokens), JWTs, and Bearer
// tokens. Preserved: scheme, host, port and path of every URL, and all
// surrounding prose — the parts that make an error diagnosable.
func Text(s string) string {
	s = urlRE.ReplaceAllStringFunc(s, redactURL)
	s = jwtRE.ReplaceAllString(s, placeholderJWT)
	s = bearerRE.ReplaceAllString(s, "Bearer "+placeholderQuery)
	return s
}

func redactURL(match string) string {
	trimmed := strings.TrimRight(match, trailingPunctuation)
	suffix := match[len(trimmed):]

	u, err := url.Parse(trimmed)
	if err != nil {
		// Unparseable, but a "?" still means everything after it is a query.
		// Cut textually rather than let a malformed URL smuggle a signature out.
		if q := strings.Index(trimmed, "?"); q >= 0 {
			return trimmed[:q] + "?" + placeholderQuery + suffix
		}
		return match
	}

	changed := false
	if u.User != nil {
		u.User = url.User(placeholderUserinfo)
		changed = true
	}
	if u.RawQuery != "" && u.RawQuery != placeholderQuery {
		// RawQuery is emitted verbatim by URL.String(), so the placeholder
		// survives as written and re-running Text is a no-op.
		u.RawQuery = placeholderQuery
		changed = true
	}
	if u.Fragment != "" && u.Fragment != placeholderQuery {
		u.Fragment = placeholderQuery
		changed = true
	}
	if !changed {
		return match
	}
	return u.String() + suffix
}
