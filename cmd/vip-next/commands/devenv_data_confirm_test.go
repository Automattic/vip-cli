package commands

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/Automattic/vip/internal/devenv"
)

// Slice-3 left `dev-env import sql --in-place` calling appctx.Confirm(nil, …),
// so the in-place gate saw VIP_NON_INTERACTIVE but never the --non-interactive
// FLAG: on a TTY, `--non-interactive` still stopped to ask. The cobra command
// must hand its own *cobra.Command down so the flag is honoured.
func TestDevEnvImportSQLInPlacePassesNonInteractiveFlag(t *testing.T) {
	src := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(src, []byte("-- MySQL dump\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	var sawCmd bool
	prev := devenvImportSQL
	devenvImportSQL = func(_ context.Context, _, _ string, o devenv.ImportOptions) error {
		if o.Confirm == nil {
			t.Error("dev-env import sql must inject a cobra-aware Confirm so --non-interactive is honoured")
			return nil
		}
		// The injected confirm must consult the command's flags. With
		// --non-interactive set it has to refuse instead of prompting.
		_, err := o.Confirm("Are you sure?", false)
		sawCmd = err != nil
		return nil
	}
	defer func() { devenvImportSQL = prev }()

	cmd := newDevEnvImportSQLCmd()
	_ = cmd.Flags().Set("slug", "e")
	cmd.Flags().Bool("non-interactive", true, "")
	_ = cmd.Flags().Set("non-interactive", "true")
	cmd.SetContext(context.Background())

	if err := cmd.RunE(cmd, []string{src}); err != nil {
		t.Fatalf("RunE: %v", err)
	}
	if !sawCmd {
		t.Error("--non-interactive must make the in-place confirm refuse, not prompt")
	}
}
