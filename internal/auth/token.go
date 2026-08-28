// Package auth handles JWT decoding, validation, and the login flow.
// Token signature verification is intentionally NOT performed — the server
// validates on every request. This mirrors src/lib/token.ts.
package auth

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	json "encoding/json/v2"
	"github.com/golang-jwt/jwt/v5"
)

// Token holds the decoded, unverified claims from a VIP access token.
// Signature verification is skipped — the API server re-validates on every
// request, matching the behavior of the Node CLI (src/lib/token.ts).
type Token struct {
	Raw string
	ID  int64
	IAT time.Time
	Exp time.Time // zero value means "no exp claim"
}

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
		switch v := id.(type) {
		case float64:
			tok.ID = int64(v)
		case int64:
			tok.ID = v
		case int:
			tok.ID = int64(v)
		}
	}

	if iat, ok := claims["iat"]; ok {
		tok.IAT = time.Unix(int64(toFloat(iat)), 0)
	}

	if exp, ok := claims["exp"]; ok {
		tok.Exp = time.Unix(int64(toFloat(exp)), 0)
	}

	return tok, nil
}

// Valid mirrors token.ts valid():
//   - false if no id
//   - false if no iat
//   - if no exp: true iff now > iat
//   - if exp:    true iff now > iat AND now < exp
func (t *Token) Valid() bool {
	if t == nil || t.ID == 0 || t.IAT.IsZero() {
		return false
	}
	now := time.Now()
	if t.Exp.IsZero() {
		return now.After(t.IAT)
	}
	return now.After(t.IAT) && now.Before(t.Exp)
}

// Expired mirrors token.ts expired():
//   - false if no exp
//   - true iff now > exp  (strict greater-than, matching Node's `now > this.exp`)
func (t *Token) Expired() bool {
	if t == nil || t.Exp.IsZero() {
		return false
	}
	return time.Now().After(t.Exp)
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int64:
		return float64(x)
	case int:
		return float64(x)
	}
	return 0
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
