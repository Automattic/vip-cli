package auth

import (
	"encoding/base64"
	"testing"
	"time"
)

// makeJWT is a thin wrapper around encodeUnsignedJWT for test readability.
func makeJWT(t *testing.T, claims map[string]any) string {
	t.Helper()
	tok, err := encodeUnsignedJWT(claims)
	if err != nil {
		t.Fatalf("encodeUnsignedJWT: %v", err)
	}
	return tok
}

func TestToken_Valid_ValidToken(t *testing.T) {
	now := time.Now()
	raw := makeJWT(t, map[string]any{
		"id":  float64(42),
		"iat": float64(now.Add(-1 * time.Hour).Unix()),
		"exp": float64(now.Add(1 * time.Hour).Unix()),
	})
	tok, err := ParseToken(raw)
	if err != nil {
		t.Fatalf("ParseToken error: %v", err)
	}
	if !tok.Valid() {
		t.Error("Valid() should be true for a token with id, past iat, future exp")
	}
	if tok.Expired() {
		t.Error("Expired() should be false for a token with future exp")
	}
	if tok.ID != 42 {
		t.Errorf("ID = %d, want 42", tok.ID)
	}
}

func TestToken_Valid_ExpiredToken(t *testing.T) {
	now := time.Now()
	raw := makeJWT(t, map[string]any{
		"id":  float64(7),
		"iat": float64(now.Add(-2 * time.Hour).Unix()),
		"exp": float64(now.Add(-1 * time.Hour).Unix()),
	})
	tok, err := ParseToken(raw)
	if err != nil {
		t.Fatalf("ParseToken error: %v", err)
	}
	if tok.Valid() {
		t.Error("Valid() should be false for an expired token")
	}
	if !tok.Expired() {
		t.Error("Expired() should be true for a token whose exp is in the past")
	}
}

func TestToken_Valid_NoID(t *testing.T) {
	now := time.Now()
	raw := makeJWT(t, map[string]any{
		"iat": float64(now.Add(-1 * time.Hour).Unix()),
		"exp": float64(now.Add(1 * time.Hour).Unix()),
	})
	tok, err := ParseToken(raw)
	if err != nil {
		t.Fatalf("ParseToken error: %v", err)
	}
	if tok.Valid() {
		t.Error("Valid() should be false when no id claim")
	}
}

func TestToken_Valid_ClaimTypesAndRanges(t *testing.T) {
	past := float64(time.Now().Add(-time.Hour).Unix())
	future := float64(time.Now().Add(time.Hour).Unix())
	base := func() map[string]any {
		return map[string]any{"id": 7, "iat": past, "exp": future}
	}
	tests := []struct {
		name  string
		claim string
		value any
	}{
		{"id string", "id", "7"},
		{"id boolean", "id", true},
		{"id null", "id", nil},
		{"id zero", "id", 0},
		{"id negative", "id", -1},
		{"id fractional", "id", 7.5},
		{"id unsafe", "id", 9_007_199_254_740_992},
		{"iat string", "iat", "123"},
		{"iat boolean", "iat", true},
		{"iat null", "iat", nil},
		{"iat zero", "iat", 0},
		{"iat negative", "iat", -1},
		{"iat beyond Date range", "iat", 8_640_000_000_001},
		{"iat future", "iat", future},
		{"exp string", "exp", "123"},
		{"exp Infinity string", "exp", "Infinity"},
		{"exp boolean", "exp", false},
		{"exp null", "exp", nil},
		{"exp beyond Date range", "exp", -8_640_000_000_001},
		{"exp zero", "exp", 0},
		{"exp year one zero time", "exp", -62_135_596_800},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			claims := base()
			claims[tc.claim] = tc.value
			tok, err := ParseToken(makeJWT(t, claims))
			if err != nil {
				t.Fatalf("ParseToken: %v", err)
			}
			if tok.Valid() {
				t.Fatal("Valid() = true, want false")
			}
		})
	}
}

func TestToken_Valid_SupportedClaimBoundaries(t *testing.T) {
	past := float64(time.Now().Add(-time.Hour).Unix())
	for _, tc := range []struct {
		name   string
		claims map[string]any
		wantID int64
	}{
		{"no expiry", map[string]any{"id": 1, "iat": past}, 1},
		{"maximum safe id", map[string]any{"id": 9_007_199_254_740_991, "iat": past}, 9_007_199_254_740_991},
		{"fractional iat", map[string]any{"id": 7, "iat": past + 0.125}, 7},
		{"maximum Date expiry", map[string]any{"id": 7, "iat": past, "exp": 8_640_000_000_000}, 7},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tok, err := ParseToken(makeJWT(t, tc.claims))
			if err != nil {
				t.Fatalf("ParseToken: %v", err)
			}
			if !tok.Valid() || tok.ID != tc.wantID {
				t.Fatalf("Valid() = %t, ID = %d; want true, %d", tok.Valid(), tok.ID, tc.wantID)
			}
		})
	}
}

func TestToken_FractionalDatesUseMilliseconds(t *testing.T) {
	raw := makeJWT(t, map[string]any{"id": 1, "iat": 1_700_000_000.125, "exp": 1_800_000_000.875})
	tok, err := ParseToken(raw)
	if err != nil {
		t.Fatalf("ParseToken: %v", err)
	}
	if got, want := tok.IAT.UnixMilli(), int64(1_700_000_000_125); got != want {
		t.Errorf("IAT.UnixMilli() = %d, want %d", got, want)
	}
	if got, want := tok.Exp.UnixMilli(), int64(1_800_000_000_875); got != want {
		t.Errorf("Exp.UnixMilli() = %d, want %d", got, want)
	}
}

func TestToken_Expired_ExplicitZeroAndYearOne(t *testing.T) {
	for _, exp := range []float64{0, -62_135_596_800} {
		tok, err := ParseToken(makeJWT(t, map[string]any{
			"id": 7, "iat": time.Now().Add(-time.Hour).Unix(), "exp": exp,
		}))
		if err != nil {
			t.Fatalf("ParseToken: %v", err)
		}
		if !tok.Expired() || tok.Valid() {
			t.Fatalf("exp %g: Expired() = %t, Valid() = %t; want true, false", exp, tok.Expired(), tok.Valid())
		}
	}
}

func TestParseToken_NonFiniteJSONNumber(t *testing.T) {
	// JSON permits numeric syntax with an exponent that overflows float64, but
	// such a claim must not become a usable token through a conversion.
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	for _, payload := range []string{
		`{"id":1e309,"iat":1700000000}`,
		`{"id":7,"iat":1e309}`,
		`{"id":7,"iat":1700000000,"exp":1e309}`,
	} {
		encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
		if tok, err := ParseToken(header + "." + encoded + "."); err == nil && tok.Valid() {
			t.Fatalf("non-finite claim in %s produced a valid token", payload)
		}
	}
}

func TestParseToken_Malformed(t *testing.T) {
	_, err := ParseToken("this.is.not.a.jwt.at.all")
	if err == nil {
		t.Error("ParseToken should return an error for a malformed JWT")
	}
}

func TestParseToken_Empty(t *testing.T) {
	_, err := ParseToken("")
	if err == nil {
		t.Error("ParseToken should return an error for an empty string")
	}
	_, err = ParseToken("   ")
	if err == nil {
		t.Error("ParseToken should return an error for a whitespace-only string")
	}
}
