package devenv

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestBuildInstanceDataDefaults(t *testing.T) {
	d := buildInstanceData(CreateConfig{Slug: "example", Title: "Example"})
	if d.SiteSlug != "example" || d.WPTitle != "Example" {
		t.Fatalf("slug/title not set: %+v", d)
	}
	// Multisite MUST be explicit false (never nil) — Node parity.
	var ms bool
	if err := json.Unmarshal(d.Multisite, &ms); err != nil || ms != false {
		t.Fatalf("multisite must be explicit false, got %s", string(d.Multisite))
	}
}

func TestBuildInstanceDataCustomDomainAndMultisite(t *testing.T) {
	d := buildInstanceData(CreateConfig{Slug: "ms", Title: "MS", MultisiteMode: "subdomain", Domain: "mysite.test", PHP: "8.3"})
	if d.Domain != "mysite.test" {
		t.Fatalf("domain not stored: %q", d.Domain)
	}
	var s string
	if err := json.Unmarshal(d.Multisite, &s); err != nil || s != "subdomain" {
		t.Fatalf("multisite subdomain not stored: %s", string(d.Multisite))
	}
	if d.PHP != "8.3" {
		t.Fatalf("php not stored: %q", d.PHP)
	}
}

func TestWriteNewEnvRejectsExisting(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := instancedata.Write("dup", &instancedata.InstanceData{SiteSlug: "dup", Multisite: json.RawMessage("false")}); err != nil {
		t.Fatal(err)
	}
	if err := writeNewEnv(CreateConfig{Slug: "dup"}); err == nil {
		t.Fatal("expected error creating an env that already exists")
	}
}

func TestWriteNewEnvRequiresSlug(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := writeNewEnv(CreateConfig{Slug: ""}); err == nil {
		t.Fatal("expected error when slug empty")
	}
}

func TestGeneratePasswordFormat(t *testing.T) {
	const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
	pw := generatePassword()
	if len(pw) != 12 {
		t.Fatalf("password length = %d, want 12 (%q)", len(pw), pw)
	}
	for _, c := range pw {
		if !strings.ContainsRune(allowed, c) {
			t.Fatalf("password %q contains disallowed char %q", pw, c)
		}
	}
}

func TestBuildInstanceDataPinsDomain(t *testing.T) {
	// No custom domain -> pin the new default explicitly (NOT empty).
	d := buildInstanceData(CreateConfig{Slug: "x", Title: "X", PHP: "8.4", WordPress: "trunk"})
	if d.Domain != compose.DefaultDomain {
		t.Fatalf("Domain = %q, want pinned default %q", d.Domain, compose.DefaultDomain)
	}
	// Custom domain wins.
	d2 := buildInstanceData(CreateConfig{Slug: "x", Title: "X", PHP: "8.4", WordPress: "trunk", Domain: "my.test"})
	if d2.Domain != "my.test" {
		t.Fatalf("Domain = %q, want my.test", d2.Domain)
	}
}

// Node generates a random adminPassword and a UUID autologinKey at create and
// persists both so the info table can show LOGIN URL + DEFAULT PASSWORD.
func TestWriteNewEnvGeneratesCredentials(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := writeNewEnv(CreateConfig{Slug: "creds"}); err != nil {
		t.Fatal(err)
	}
	d, err := instancedata.Read("creds")
	if err != nil {
		t.Fatal(err)
	}
	if len(d.AdminPassword) != 12 || d.AdminPassword == "password" {
		t.Fatalf("adminPassword not generated: %q", d.AdminPassword)
	}
	if d.AutologinKey == "" {
		t.Fatalf("autologinKey not generated")
	}
}
