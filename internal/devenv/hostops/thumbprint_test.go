package hostops

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha1" // #nosec G505 -- test verifies the SHA-1 thumbprint format, not a security primitive
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestCertThumbprint verifies certThumbprint reads a PEM cert and returns its
// SHA-1 thumbprint as uppercase hex — the identifier the Windows cert store uses.
func TestCertThumbprint(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(42),
		Subject:               pkix.Name{CommonName: "WPVIP Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})

	p := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(p, pemBytes, 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := certThumbprint(p)
	if err != nil {
		t.Fatalf("certThumbprint: %v", err)
	}
	sum := sha1.Sum(der) // #nosec G401 -- test comparison, not security
	want := strings.ToUpper(hex.EncodeToString(sum[:]))
	if got != want {
		t.Fatalf("thumbprint = %q, want %q", got, want)
	}
	if len(got) != 40 {
		t.Fatalf("thumbprint %q is not 40 hex chars", got)
	}
}
