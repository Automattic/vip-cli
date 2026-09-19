package auth

import (
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
