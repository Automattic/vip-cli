package commands

import (
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/nodeflags"
)

// parseDevEnv drives argv through the SAME path production uses: the
// optional-value normalizer, then cobra's own command resolution and flag
// parser. Asserting on a coercion helper alone would pass even while `-p n`
// still enabled the service, which is the bug this file exists to pin.
func parseDevEnv(t *testing.T, argv ...string) *cobra.Command {
	t.Helper()
	root := DevEnvCmd()
	normalized := nodeflags.NormalizeOptionalValues(root, argv)
	c, rest, err := root.Find(normalized)
	if err != nil {
		t.Fatalf("find %q: %v", argv, err)
	}
	if err := c.ParseFlags(rest); err != nil {
		t.Fatalf("parse %q: %v", argv, err)
	}
	return c
}

// Node shorts for the dev-env service toggles, derived by
// createOptionDefinition (src/lib/cli/command.js:62-82) over the registration
// order in addDevEnvConfigurationOptions
// (src/lib/dev-environment/dev-environment-cli.ts:1012-1081).
var devEnvServiceShorts = map[string]string{
	"phpmyadmin":    "p",
	"xdebug":        "x",
	"elasticsearch": "e",
	"cron":          "c",
	"mailpit":       "A",
	"photon":        "H",
}

type serviceFlagCase struct {
	args []string
	want bool
}

func serviceFlagCases(svc, short string) []serviceFlagCase {
	return []serviceFlagCase{
		// processBooleanOption: FALSE_OPTIONS = false, everything else true.
		{[]string{"--" + svc, "n"}, false},
		{[]string{"--" + svc, "no"}, false},
		{[]string{"--" + svc, "false"}, false},
		{[]string{"--" + svc, "0"}, false},
		{[]string{"--" + svc, "N"}, false},
		{[]string{"--" + svc + "=n"}, false},
		{[]string{"--" + svc + "=false"}, false},
		{[]string{"-" + short, "n"}, false},
		{[]string{"-" + short + "=n"}, false},
		{[]string{"-" + short + "n"}, false},
		// Bare flag => enabled (commander fills an omitted optional value
		// with `true`; Node's help documents "y" as the default value).
		{[]string{"--" + svc}, true},
		{[]string{"-" + short}, true},
		{[]string{"--" + svc, "y"}, true},
		{[]string{"--" + svc, "yes"}, true},
		{[]string{"--" + svc, "1"}, true},
		{[]string{"--" + svc + "=true"}, true},
		{[]string{"-" + short, "y"}, true},
		// Unrecognized values are TRUE in Node, not an error.
		{[]string{"--" + svc, "maybe"}, true},
	}
}

func TestDevEnvCreateServiceFlagsUseNodeYNGrammar(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	for svc, short := range devEnvServiceShorts {
		for _, tc := range serviceFlagCases(svc, short) {
			argv := append([]string{"create"}, tc.args...)
			c := parseDevEnv(t, argv...)
			got, err := resolveCreateBool(c, svc, "")
			if err != nil {
				t.Fatalf("%q: %v", argv, err)
			}
			if got != tc.want {
				t.Errorf("dev-env %q => %s = %v, want %v", argv, svc, got, tc.want)
			}
			// The value token must be consumed as the flag's value, not left
			// dangling as a positional (the old bool flags swallowed it).
			if n := len(c.Flags().Args()); n != 0 {
				t.Errorf("dev-env %q left %d stray positional(s): %q", argv, n, c.Flags().Args())
			}
		}
	}
}

func TestDevEnvUpdateServiceFlagsUseNodeYNGrammar(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	for svc, short := range devEnvServiceShorts {
		for _, tc := range serviceFlagCases(svc, short) {
			argv := append([]string{"update"}, tc.args...)
			c := parseDevEnv(t, argv...)
			// current=true so a nil return (leave unchanged) cannot masquerade
			// as a correct `false`.
			got, err := resolveUpdateBool(c, svc, "", true)
			if err != nil {
				t.Fatalf("%q: %v", argv, err)
			}
			if got == nil {
				t.Fatalf("dev-env %q: %s not applied", argv, svc)
			}
			if *got != tc.want {
				t.Errorf("dev-env %q => %s = %v, want %v", argv, svc, *got, tc.want)
			}
		}
	}
}

// Node: processMediaRedirectDomainOption (dev-environment-cli.ts:948-961).
func TestDevEnvMediaRedirectDomainGrammar(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	for _, cmdName := range []string{"create", "update"} {
		for _, disable := range []string{"n", "no", "false", "0", "N"} {
			c := parseDevEnv(t, cmdName, "--media-redirect-domain", disable)
			got, err := devEnvMediaRedirectDomain(c)
			if err != nil {
				t.Fatalf("%s --media-redirect-domain %s: %v", cmdName, disable, err)
			}
			if got != "" {
				t.Errorf("%s --media-redirect-domain %s = %q, want \"\" (disabled)", cmdName, disable, got)
			}
		}
		for _, truthy := range []string{"y", "yes", "true", "1"} {
			c := parseDevEnv(t, cmdName, "-r", truthy)
			if _, err := devEnvMediaRedirectDomain(c); err == nil {
				t.Errorf("%s -r %s: want an error, got nil", cmdName, truthy)
			}
		}
		c := parseDevEnv(t, cmdName, "-r", "example.go-vip.co")
		got, err := devEnvMediaRedirectDomain(c)
		if err != nil || got != "example.go-vip.co" {
			t.Errorf("%s -r example.go-vip.co = (%q, %v)", cmdName, got, err)
		}
	}
}

// Node: every dev-env bin that registers --slug passes processSlug
// (dev-environment-cli.ts:979) as the option's parse function.
func TestDevEnvSlugIsLowercased(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := parseDevEnv(t, "start", "--slug", "Example-Site")
	got, err := ResolveSlug(c)
	if err != nil {
		t.Fatal(err)
	}
	if got != "example-site" {
		t.Errorf("ResolveSlug = %q, want %q", got, "example-site")
	}

	cc := parseDevEnv(t, "create", "-s", "MixedCase")
	cfg, err := resolveCreateConfig(cc, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Slug != "mixedcase" {
		t.Errorf("create slug = %q, want %q", cfg.Slug, "mixedcase")
	}
}

// Node names this option with an UNDERSCORE (dev-environment-cli.ts:1042).
func TestDevEnvXdebugConfigUnderscoreForm(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	for _, cmdName := range []string{"create", "update"} {
		for _, flag := range []string{"--xdebug_config", "--xdebug-config"} {
			c := parseDevEnv(t, cmdName, flag, "idekey=vip")
			cfg, err := devEnvXdebugConfig(c)
			if err != nil {
				t.Fatalf("%s %s: %v", cmdName, flag, err)
			}
			if cfg != "idekey=vip" {
				t.Errorf("%s %s => %q", cmdName, flag, cfg)
			}
		}
	}
}

// Node: processComponentOptionInput (dev-environment-cli.ts:237) — a value
// with no path separator is an IMAGE reference, not a bind-mount path.
func TestDevEnvCreateAppCodeDemoIsNotAPath(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	c := parseDevEnv(t, "create", "--app-code", "demo", "--mu-plugins", "demo")
	cfg, err := resolveCreateConfig(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AppCodeDir != "" {
		t.Errorf("--app-code demo => AppCodeDir %q, want \"\" (image mode)", cfg.AppCodeDir)
	}
	if cfg.MuPluginsDir != "" {
		t.Errorf("--mu-plugins demo => MuPluginsDir %q, want \"\" (image mode)", cfg.MuPluginsDir)
	}

	local := parseDevEnv(t, "create", "--app-code", "/tmp/repo")
	lcfg, err := resolveCreateConfig(local, nil)
	if err != nil {
		t.Fatal(err)
	}
	if lcfg.AppCodeDir != "/tmp/repo" {
		t.Errorf("--app-code /tmp/repo => AppCodeDir %q", lcfg.AppCodeDir)
	}
}

// Node: --multisite uses processStringOrBooleanOption and is an optional-value
// option whose documented bare default is "y" (subdomain).
func TestDevEnvCreateMultisiteGrammar(t *testing.T) {
	t.Setenv("VIP_NON_INTERACTIVE", "1")
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"--multisite"}, "subdomain"},
		{[]string{"-m"}, "subdomain"},
		{[]string{"--multisite", "y"}, "subdomain"},
		{[]string{"--multisite", "1"}, "subdomain"},
		{[]string{"--multisite=true"}, "subdomain"},
		{[]string{"--multisite", "subdirectory"}, "subdirectory"},
		{[]string{"--multisite=subdirectory"}, "subdirectory"},
		{[]string{"--multisite", "n"}, ""},
		{[]string{"--multisite", "false"}, ""},
		{[]string{"--multisite", "0"}, ""},
	}
	for _, tc := range cases {
		c := parseDevEnv(t, append([]string{"create"}, tc.args...)...)
		cfg, err := resolveCreateConfig(c, nil)
		if err != nil {
			t.Fatalf("%q: %v", tc.args, err)
		}
		if cfg.MultisiteMode != tc.want {
			t.Errorf("create %q => multisite %q, want %q", tc.args, cfg.MultisiteMode, tc.want)
		}
	}
}
