package commands

import (
	"testing"

	"github.com/spf13/cobra"
)

func TestDevEnvStartRegistersSkipConfirmation(t *testing.T) {
	c := devEnvStartCmd()
	if c.Flag("skip-confirmation") == nil {
		t.Fatal("start must register --skip-confirmation for Lando adoption")
	}
}

// leafNames collects the full subcommand path set so we can assert the tree.
func leafNames(c *cobra.Command, prefix string, out map[string]bool) {
	name := prefix + c.Name()
	if !c.HasSubCommands() {
		out[name] = true
		return
	}
	for _, ch := range c.Commands() {
		leafNames(ch, name+" ", out)
	}
}

func TestDevEnvTreeHasAll23Leaves(t *testing.T) {
	root := DevEnvCmd()
	got := map[string]bool{}
	leafNames(root, "", got)
	want := []string{
		"dev-env create", "dev-env destroy", "dev-env start", "dev-env stop",
		"dev-env exec", "dev-env shell", "dev-env info", "dev-env list",
		"dev-env logs", "dev-env purge", "dev-env update",
		"dev-env sync sql",
		"dev-env envvar get", "dev-env envvar get-all", "dev-env envvar list",
		"dev-env envvar set", "dev-env envvar delete",
		"dev-env import sql", "dev-env import media",
	}
	for _, w := range want {
		if !got[w] {
			t.Errorf("missing leaf %q (have %v)", w, got)
		}
	}
}

func TestDevEnvCreateParsesFlags(t *testing.T) {
	root := DevEnvCmd()
	c, _, err := root.Find([]string{"create"})
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ParseFlags([]string{"--slug", "x", "--php", "8.2", "--multisite", "subdirectory", "--start=false"}); err != nil {
		t.Fatalf("create flags failed to parse: %v", err)
	}
	if v, _ := c.Flags().GetString("php"); v != "8.2" {
		t.Fatalf("--php = %q, want 8.2", v)
	}
}
