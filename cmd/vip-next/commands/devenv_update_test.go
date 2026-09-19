package commands

import (
	"encoding/json"
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestResolveUpdateConfigNonInteractiveFlagsOnly(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := newDevEnvUpdateCmd()
	if err := c.Flags().Parse([]string{"--php", "8.4", "--phpmyadmin"}); err != nil {
		t.Fatal(err)
	}
	cur := &instancedata.InstanceData{PHP: "8.2", PHPMyAdmin: false}
	got, err := resolveUpdateConfig(c, cur)
	if err != nil {
		t.Fatal(err)
	}
	if got.PHP == nil || *got.PHP != "8.4" {
		t.Fatalf("PHP = %v, want 8.4", got.PHP)
	}
	if got.PHPMyAdmin == nil || !*got.PHPMyAdmin {
		t.Fatalf("phpmyadmin = %v, want true", got.PHPMyAdmin)
	}
	// Unflagged fields stay nil (unchanged) in non-interactive mode.
	if got.WordPress != nil || got.Xdebug != nil || got.MuPluginsDir != nil {
		t.Fatalf("unflagged fields must be nil: %+v", got)
	}
}

func TestSelectWithDefaultNonInteractive(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := &cobra.Command{}
	got, err := selectWithDefault(c, "x", []string{"a", "b", "c"}, "b")
	if err != nil || got != "b" {
		t.Fatalf("default-in-options: got %q,%v want b", got, err)
	}
	got, _ = selectWithDefault(c, "x", []string{"a", "b"}, "z")
	if got != "a" {
		t.Fatalf("default-not-in-options: got %q want a (first)", got)
	}
}

func TestCurrentPHPVersion(t *testing.T) {
	cases := map[string]string{
		"ghcr.io/automattic/vip-container-images/php-fpm:8.2": "8.2",
		"8.4": "8.4",
		"":    "",
	}
	for in, want := range cases {
		if got := currentPHPVersion(&instancedata.InstanceData{PHP: in}); got != want {
			t.Errorf("currentPHPVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPHPLabelForVersion(t *testing.T) {
	if phpLabelForVersion("8.2") != "8.2 (recommended)" {
		t.Fatal("8.2 should map to the recommended label")
	}
	if phpLabelForVersion("9.9") != "" {
		t.Fatal("unknown version should map to empty")
	}
}

func TestRawTruthy(t *testing.T) {
	if !rawTruthy(json.RawMessage("true")) {
		t.Fatal("true should be truthy")
	}
	if rawTruthy(json.RawMessage("false")) {
		t.Fatal("false should not be truthy")
	}
	if !rawTruthy(json.RawMessage(`"subdomain"`)) {
		t.Fatal("non-empty string should be truthy")
	}
	if rawTruthy(nil) {
		t.Fatal("nil should not be truthy")
	}
}
