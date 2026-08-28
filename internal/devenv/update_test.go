package devenv

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

func TestApplyUpdateOverlaysProvidedFields(t *testing.T) {
	d := &instancedata.InstanceData{PHP: "8.1", PHPMyAdmin: false}
	applyUpdate(d, UpdateConfig{
		PHP:        strPtr("8.3"),
		WordPress:  strPtr("6.5"),
		PHPMyAdmin: boolPtr(true),
	})
	if d.PHP != "8.3" {
		t.Fatalf("PHP = %q, want 8.3", d.PHP)
	}
	if d.WordPress.Tag != "6.5" {
		t.Fatalf("WordPress.Tag = %q, want 6.5", d.WordPress.Tag)
	}
	if !d.PHPMyAdmin {
		t.Fatal("PHPMyAdmin should be true")
	}
}

func TestApplyUpdateLeavesUnsetFields(t *testing.T) {
	d := &instancedata.InstanceData{PHP: "8.1"}
	applyUpdate(d, UpdateConfig{})
	if d.PHP != "8.1" {
		t.Fatalf("PHP changed unexpectedly: %q", d.PHP)
	}
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func TestApplyUpdateCronAndXdebugConfig(t *testing.T) {
	d := &instancedata.InstanceData{}
	applyUpdate(d, UpdateConfig{Cron: boolPtr(true), XdebugConfig: strPtr("idekey=VIP")})
	if !d.Cron {
		t.Fatal("Cron should be true")
	}
	if d.XdebugConfig != "idekey=VIP" {
		t.Fatalf("XdebugConfig = %q", d.XdebugConfig)
	}
}
