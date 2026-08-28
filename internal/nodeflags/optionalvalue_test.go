package nodeflags

import (
	"slices"
	"testing"

	"github.com/spf13/cobra"
)

// testTree mirrors the shape the real dev-env tree has: a parent, a leaf with
// two optional-value flags plus one ordinary value flag, and a
// DisableFlagParsing leaf (like `vip wp`).
func testTree() *cobra.Command {
	root := &cobra.Command{Use: "root"}

	leaf := &cobra.Command{Use: "create", Run: func(*cobra.Command, []string) {}}
	leaf.Flags().StringP("phpmyadmin", "p", "", "")
	leaf.Flags().StringP("xdebug", "x", "", "")
	leaf.Flags().StringP("slug", "s", "", "")
	MarkOptionalValue(leaf, "y", "phpmyadmin", "xdebug")
	root.AddCommand(leaf)

	raw := &cobra.Command{Use: "wp", DisableFlagParsing: true, Run: func(*cobra.Command, []string) {}}
	root.AddCommand(raw)

	return root
}

func TestNormalizeOptionalValues(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{
			// commander: "historical behaviour is optional value is following
			// arg unless an option" (Command.parseOptions).
			"short flag takes the following token",
			[]string{"create", "-p", "n"},
			[]string{"create", "-p=n"},
		},
		{
			"long flag takes the following token",
			[]string{"create", "--phpmyadmin", "n"},
			[]string{"create", "--phpmyadmin=n"},
		},
		{
			// _combineFlagAndOptionalValue defaults to true in commander.
			"attached short value",
			[]string{"create", "-pn"},
			[]string{"create", "-p=n"},
		},
		{
			"bare flag at end of argv keeps its NoOptDefVal",
			[]string{"create", "--phpmyadmin"},
			[]string{"create", "--phpmyadmin"},
		},
		{
			"following option token is not consumed as a value",
			[]string{"create", "--phpmyadmin", "--xdebug", "n"},
			[]string{"create", "--phpmyadmin", "--xdebug=n"},
		},
		{
			"inline value is left alone",
			[]string{"create", "--phpmyadmin=n"},
			[]string{"create", "--phpmyadmin=n"},
		},
		{
			// Node isOptionToken(): `arg !== '-' && arg.startsWith('-')`, so a
			// bare dash IS a value.
			"bare dash is a value, not an option",
			[]string{"create", "--phpmyadmin", "-"},
			[]string{"create", "--phpmyadmin=-"},
		},
		{
			"ordinary value flags are untouched",
			[]string{"create", "--slug", "Example", "-p", "n"},
			[]string{"create", "--slug", "Example", "-p=n"},
		},
		{
			"nothing past the -- terminator is rewritten",
			[]string{"create", "--", "--phpmyadmin", "n"},
			[]string{"create", "--", "--phpmyadmin", "n"},
		},
		{
			"DisableFlagParsing commands are passed through verbatim",
			[]string{"wp", "--phpmyadmin", "n"},
			[]string{"wp", "--phpmyadmin", "n"},
		},
		{
			"unresolvable command is passed through verbatim",
			[]string{"nope", "--phpmyadmin", "n"},
			[]string{"nope", "--phpmyadmin", "n"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := NormalizeOptionalValues(testTree(), c.in)
			if !slices.Equal(got, c.want) {
				t.Errorf("NormalizeOptionalValues(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// The normalizer is only half the fix; the flag must also carry NoOptDefVal so
// the bare form means "enable" rather than "flag needs an argument".
func TestMarkOptionalValueSetsNoOptDefVal(t *testing.T) {
	root := testTree()
	leaf, _, err := root.Find([]string{"create"})
	if err != nil {
		t.Fatal(err)
	}
	f := leaf.Flags().Lookup("phpmyadmin")
	if f.NoOptDefVal != "y" {
		t.Errorf("NoOptDefVal = %q, want \"y\"", f.NoOptDefVal)
	}
	if leaf.Flags().Lookup("slug").NoOptDefVal != "" {
		t.Error("--slug must not become an optional-value flag")
	}
}

// End-to-end through cobra's own parser: this is the assertion that would still
// have passed with the old bool flags if it only exercised ProcessBooleanOption.
func TestOptionalValueParsesThroughCobra(t *testing.T) {
	cases := []struct {
		argv []string
		want bool
	}{
		{[]string{"create", "-p", "n"}, false},
		{[]string{"create", "-p", "no"}, false},
		{[]string{"create", "-p", "false"}, false},
		{[]string{"create", "-p", "0"}, false},
		{[]string{"create", "--phpmyadmin", "n"}, false},
		{[]string{"create", "--phpmyadmin=n"}, false},
		{[]string{"create", "-pn"}, false},
		{[]string{"create", "-p"}, true},
		{[]string{"create", "--phpmyadmin"}, true},
		{[]string{"create", "-p", "y"}, true},
		{[]string{"create", "--phpmyadmin=yes"}, true},
		{[]string{"create", "--phpmyadmin", "maybe"}, true}, // Node: not in FALSE_OPTIONS => true
	}
	for _, c := range cases {
		root := testTree()
		argv := NormalizeOptionalValues(root, c.argv)
		leaf, rest, err := root.Find(argv)
		if err != nil {
			t.Fatalf("%q: find: %v", c.argv, err)
		}
		if err := leaf.ParseFlags(rest); err != nil {
			t.Fatalf("%q: parse: %v", c.argv, err)
		}
		raw, _ := leaf.Flags().GetString("phpmyadmin")
		if got := ProcessBooleanOption(raw); got != c.want {
			t.Errorf("%q => raw %q => %v, want %v", c.argv, raw, got, c.want)
		}
	}
}
