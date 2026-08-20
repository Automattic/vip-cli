//go:build devenv_e2e

package devenv

import (
	"os"
	"testing"

	"github.com/Automattic/vip/internal/devenv/e2esafety"
)

func TestMain(m *testing.M) {
	if e2esafety.Skip(os.Getenv, os.Stdout) {
		os.Exit(0)
	}
	os.Exit(m.Run())
}
