// Package auth handles JWT decoding, validation, and the login flow.
// Token signature verification is intentionally NOT performed — the server
// validates on every request. This mirrors src/lib/token.ts.
package auth

import (
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	json "encoding/json/v2"
	"github.com/golang-jwt/jwt/v5"
)

// Token holds the decoded, unverified claims from a VIP access token.
// Signature verification is skipped — the API server re-validates on every
// request, matching the behavior of the Node CLI (src/lib/token.ts).
type Token struct {
	Raw           string
	ID            int64
	IAT           time.Time
	Exp           time.Time
	hasExp        bool
	invalidClaims bool
}

const (
	maxSafeID           = 9_007_199_254_740_991 // Number.MAX_SAFE_INTEGER in Node.js
	maxDateMilliseconds = 8_640_000_000_000_000 // JavaScript Date's TimeClip limit
)

// ParseToken decodes the JWT claims without verifying the signature.
// Returns an error if raw is empty or the JWT is structurally invalid.
func ParseToken(raw string) (*Token, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("token is empty")
	}

	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	claims := jwt.MapClaims{}
	_, _, err := parser.ParseUnverified(raw, claims)
	if err != nil {
		return nil, fmt.Errorf("parse jwt: %w", err)
	}

	tok := &Token{Raw: raw}

	if id, ok := claims["id"]; ok {
		n, numeric := id.(float64)
		if !numeric || !finite(n) || n <= 0 || n > maxSafeID || math.Trunc(n) != n {
			tok.invalidClaims = true
			return tok, nil
		}
		tok.ID = int64(n)
	}

	if iat, ok := claims["iat"]; ok {
		n, numeric := iat.(float64)
		if !numeric || !finite(n) || n <= 0 {
			tok.invalidClaims = true
			return tok, nil
		}
		var valid bool
		tok.IAT, valid = jsDate(n)
		if !valid {
			tok.invalidClaims = true
			return tok, nil
		}
	}

	if exp, ok := claims["exp"]; ok {
		n, numeric := exp.(float64)
		if !numeric || !finite(n) {
			tok.invalidClaims = true
			return tok, nil
		}
		var valid bool
		tok.Exp, valid = jsDate(n)
		if !valid {
			tok.invalidClaims = true
			return tok, nil
		}
		tok.hasExp = true
	}

	return tok, nil
}

// Valid mirrors token.ts valid():
//   - false if no id
//   - false if no iat
//   - if no exp: true iff now > iat
//   - if exp:    true iff now > iat AND now < exp
func (t *Token) Valid() bool {
	if t == nil || t.invalidClaims || t.ID == 0 || t.IAT.IsZero() {
		return false
	}
	now := time.Now()
	if !t.hasExp && t.Exp.IsZero() {
		return now.After(t.IAT)
	}
	return now.After(t.IAT) && now.Before(t.Exp)
}

// Expired mirrors token.ts expired():
//   - false if no exp
//   - true iff now > exp  (strict greater-than, matching Node's `now > this.exp`)
func (t *Token) Expired() bool {
	if t == nil || (!t.hasExp && t.Exp.IsZero()) {
		return false
	}
	return time.Now().After(t.Exp)
}

func finite(n float64) bool {
	return !math.IsNaN(n) && !math.IsInf(n, 0)
}

// jsDate applies JavaScript Date's millisecond precision and TimeClip range
// before converting to time.Time. This avoids overflowing int64 on hostile
// numeric claims and keeps fractional seconds consistent with Node.js.
func jsDate(seconds float64) (time.Time, bool) {
	milliseconds := seconds * 1000
	if !finite(milliseconds) || math.Abs(milliseconds) > maxDateMilliseconds {
		return time.Time{}, false
	}
	milliseconds = math.Trunc(milliseconds)
	ms := int64(milliseconds)
	return time.Unix(ms/1000, (ms%1000)*int64(time.Millisecond)), true
}

// encodeUnsignedJWT crafts an alg:none JWT from a claims map via base64url
// encoding. Used only by tests — not part of the production API.
func encodeUnsignedJWT(claims map[string]any) (string, error) {
	headerJSON, err := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	if err != nil {
		return "", fmt.Errorf("marshal header: %w", err)
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(headerJSON) + "." + enc.EncodeToString(claimsJSON) + ".", nil
}
