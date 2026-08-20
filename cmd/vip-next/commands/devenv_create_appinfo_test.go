package commands

import "testing"

func TestBuildCreateDefaultsPrefersEnvName(t *testing.T) {
	d := buildCreateDefaults("my-app", "cantina-trunk-staging", false, "example.com", "8.2", "6.4")
	if d.Title != "cantina-trunk-staging" {
		t.Fatalf("title = %q, want env name", d.Title)
	}
	if d.Multisite {
		t.Fatalf("multisite should be false")
	}
	if d.PHP != "8.2" || d.WordPress != "6.4" {
		t.Fatalf("php/wordpress not mapped: %+v", d)
	}
	if d.MediaRedirectDomain != "example.com" {
		t.Fatalf("mediaRedirectDomain not mapped: %q", d.MediaRedirectDomain)
	}
}

func TestBuildCreateDefaultsFallsBackToAppName(t *testing.T) {
	d := buildCreateDefaults("my-app", "", true, "", "", "")
	if d.Title != "my-app" {
		t.Fatalf("title = %q, want app name fallback", d.Title)
	}
	if !d.Multisite {
		t.Fatalf("multisite should be true")
	}
}
