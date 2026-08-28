package devenv

import (
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/compose"
)

func TestAdoptSetupStepsPrependsRecursiveChownWhenAdopting(t *testing.T) {
	base := []compose.SetupStep{{AsRoot: false, Command: "sh /dev-tools/setup.sh"}}

	if got := adoptSetupSteps(base, false); len(got) != 1 {
		t.Fatalf("non-adopting start must be unchanged, got %+v", got)
	}

	got := adoptSetupSteps(base, true)
	if len(got) != 2 {
		t.Fatalf("adopting start must prepend one step, got %+v", got)
	}
	if !got[0].AsRoot || !strings.Contains(got[0].Command, "chown -R www-data:www-data /wp/wp-content") {
		t.Fatalf("want a recursive root chown first, got %+v", got[0])
	}
	if got[1].Command != base[0].Command {
		t.Fatalf("original setup steps must follow, got %+v", got[1])
	}
	if len(base) != 1 {
		t.Fatal("base slice must not be mutated")
	}
}
