package main

import (
	"sort"
	"strings"
	"testing"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// nodeShortFlags is the per-command short-alias table the Node CLI actually
// exposes. It is not a style choice: Node's createOptionDefinition
// (src/lib/cli/command.js:62-82) derives a one-character short alias for EVERY
// option from the first letter of its long name, reserving only h/v/d and
// skipping a letter already taken on that command. The registration order is
// what resolves collisions, and it is fixed:
//
//	--app (appContext||requireConfirm), --env (envContext||childEnvContext),
//	--force (requireConfirm), --format (format), -h/--help, -v/--version,
//	-d/--debug, then the bin's own .option() calls in source order
//	(command.js:1075-1111).
//
// That is why, for example, `vip logs --format` has NO short (`-f` went to
// --follow, registered first) while `vip slowlogs --format` DOES (`format:
// true` is registered by the factory, before the bin's own options).
//
// Keys are Go command paths; values map the Go flag name to Node's short.
// Where vip-next renamed a flag, the Node source line is called out.
var nodeShortFlags = map[string]map[string]string{
	// src/bin/vip.js — only the three globals.
	"vip-next": {"debug": "d"},

	// Go-only commands. No Node bin exists; the entries are what Node's
	// derivation rule would produce for an appContext+envContext command,
	// so the surface stays self-consistent.
	"vip-next login":                    {},
	"vip-next defensive-mode":           {},
	"vip-next defensive-mode enable":    {"app": "a", "env": "e"},
	"vip-next defensive-mode disable":   {"app": "a", "env": "e"},
	"vip-next defensive-mode configure": {"app": "a", "env": "e"},

	"vip-next logout": {}, // src/bin/vip-logout.ts
	"vip-next whoami": {}, // src/bin/vip-whoami.ts

	// src/bin/vip-logs.js:241-257 — type, limit, follow, format (f taken).
	"vip-next logs": {"app": "a", "env": "e", "type": "t", "limit": "l", "follow": "f"},
	// src/bin/vip-slowlogs.ts:199 — format:true in the factory, then limit.
	"vip-next slowlogs": {"app": "a", "env": "e", "format": "f", "limit": "l"},

	"vip-next app":                 {"format": "f"}, // src/bin/vip-app.js
	"vip-next app list":            {"format": "f"}, // src/bin/vip-app-list.js
	"vip-next app deploy":          {"message": "m", "skip-confirmation": "s", "force": "f", "app": "a", "env": "e"},
	"vip-next app deploy validate": {}, // src/bin/vip-app-deploy-validate.ts

	"vip-next config":                 {},
	"vip-next config envvar":          {},
	"vip-next config envvar list":     {"app": "a", "env": "e", "format": "f"},
	"vip-next config envvar get":      {"app": "a", "env": "e"},
	"vip-next config envvar get-all":  {"app": "a", "env": "e", "format": "f"},
	"vip-next config envvar set":      {"app": "a", "env": "e", "from-file": "f", "skip-confirmation": "s"},
	"vip-next config envvar delete":   {"app": "a", "env": "e", "skip-confirmation": "s"},
	"vip-next config software":        {},
	"vip-next config software get":    {"app": "a", "env": "e", "format": "f", "include": "i"},
	"vip-next config software update": {"app": "a", "env": "e", "yes": "y"},

	"vip-next db":            {},
	"vip-next db phpmyadmin": {"app": "a", "env": "e", "print": "p", "silent": "s"},

	"vip-next cache":           {},
	"vip-next cache purge-url": {"app": "a", "env": "e", "from-file": "f"},

	"vip-next import":                {},
	"vip-next import validate-sql":   {},
	"vip-next import validate-files": {},
	// src/bin/vip-import-sql.js — --search-replace, --skip-maintenance-mode
	// and --header collide with earlier letters and get no short.
	"vip-next import sql":        {"app": "a", "env": "e", "skip-validate": "s", "in-place": "i", "output": "o", "md5": "m", "skip-backup": "B"},
	"vip-next import sql status": {"app": "a", "env": "e"},
	// src/bin/vip-import-media.js — requireConfirm registers -f/--force.
	// vip-next's canonical name for that gate is --skip-confirmation, so the
	// short (and the --force spelling) ride on it.
	"vip-next import media":        {"app": "a", "env": "e", "skip-confirmation": "f", "saveErrorLog": "s", "overwriteExistingFiles": "o", "importIntermediateImages": "i"},
	"vip-next import media status": {"app": "a", "env": "e", "saveErrorLog": "s"},
	"vip-next import media abort":  {"app": "a", "env": "e", "skip-confirmation": "f"},

	"vip-next backup":    {},
	"vip-next backup db": {"app": "a", "env": "e"},
	"vip-next export":    {},
	"vip-next export sql": {"app": "a", "env": "e", "output": "o", "table": "t", "site-id": "s",
		"wpcli-command": "w", "config-file": "c", "generate-backup": "g"},

	// src/bin/vip-sync.js — requireConfirm -f/--force, same rename as media.
	"vip-next sync": {"app": "a", "env": "e", "skip-confirmation": "f"},
	// src/bin/vip-wp.js — DisableFlagParsing; -y/--yes is lifted out of argv
	// by normalizeWPArgs, and --app/--env remain the known WP1 limitation.
	"vip-next wp": {},
	// src/bin/vip-search-replace.js
	"vip-next search-replace": {"search-replace": "s", "in-place": "i", "output": "o"},

	"vip-next dev-env": {},
	"vip-next dev-env create": {"slug": "s", "title": "t", "multisite": "m", "wordpress": "w",
		"mu-plugins": "u", "app-code": "a", "phpmyadmin": "p", "xdebug": "x", "elasticsearch": "e",
		"media-redirect-domain": "r", "cron": "c", "mailpit": "A", "photon": "H"},
	"vip-next dev-env update": {"slug": "s", "wordpress": "w", "mu-plugins": "u", "app-code": "a",
		"phpmyadmin": "p", "xdebug": "x", "elasticsearch": "e", "media-redirect-domain": "r",
		"cron": "c", "mailpit": "A", "photon": "H"},
	"vip-next dev-env start":   {"slug": "s", "skip-wp-versions-check": "w", "editor": "e"},
	"vip-next dev-env stop":    {"slug": "s", "all": "a"},
	"vip-next dev-env destroy": {"slug": "s"},
	"vip-next dev-env info":    {"slug": "s", "all": "a", "extended": "e"},
	"vip-next dev-env list":    {},
	"vip-next dev-env purge":   {"soft": "s", "force": "f"},
	"vip-next dev-env exec":    {"slug": "s", "force": "f", "quiet": "q"},
	"vip-next dev-env shell":   {"slug": "s", "root": "r"},
	"vip-next dev-env logs":    {"slug": "s", "follow": "f"},
	"vip-next dev-env sync":    {},
	"vip-next dev-env sync sql": {"app": "a", "env": "e", "slug": "s", "table": "t",
		"wpcli-command": "w", "config-file": "c", "force": "f"},
	"vip-next dev-env envvar":         {},
	"vip-next dev-env envvar get":     {"slug": "s"},
	"vip-next dev-env envvar get-all": {"slug": "s", "format": "f"},
	"vip-next dev-env envvar list":    {"slug": "s", "format": "f"},
	"vip-next dev-env envvar set":     {"slug": "s", "from-file": "f"},
	"vip-next dev-env envvar delete":  {"slug": "s"},
	"vip-next dev-env import":         {},
	"vip-next dev-env import sql":     {"slug": "s", "search-replace": "r", "in-place": "i", "skip-reindex": "k", "quiet": "q"},
	"vip-next dev-env import media":   {"slug": "s"},
}

// goOnlyShorts are shorts on flags Node does not have at all. Every entry is a
// deliberate vip-next extension; anything not listed here and not in
// nodeShortFlags is a regression.
var goOnlyShorts = map[string]map[string]string{
	// vip-next-only repeatable URL mapping for multisite dev-env sync; Node's
	// sync sql has no --search-replace, so -r is free on this command.
	"vip-next dev-env sync sql": {"search-replace": "r"},
}

func walkTree(c *cobra.Command, prefix string, out map[string]*cobra.Command) {
	path := strings.TrimSpace(prefix + " " + c.Name())
	out[path] = c
	for _, child := range c.Commands() {
		walkTree(child, path, out)
	}
}

func commandTree(t *testing.T) map[string]*cobra.Command {
	t.Helper()
	root := newRootCmd(&rootContext{})
	tree := map[string]*cobra.Command{}
	walkTree(root, "", tree)
	for _, c := range tree {
		// Cobra adds these lazily during execute(); force them so the test
		// sees the same flag set a real invocation would.
		c.InitDefaultHelpFlag()
		c.InitDefaultVersionFlag()
	}
	return tree
}

func TestShortFlagAliasesMatchNode(t *testing.T) {
	tree := commandTree(t)

	for path, c := range tree {
		want, known := nodeShortFlags[path]
		if !known {
			t.Errorf("command %q has no entry in nodeShortFlags; add one derived from the Node source", path)
			continue
		}
		extra := goOnlyShorts[path]

		local := c.LocalFlags()
		for long, short := range want {
			f := local.Lookup(long)
			if f == nil {
				t.Errorf("%s: missing flag --%s (Node exposes -%s, --%s)", path, long, short, long)
				continue
			}
			if f.Shorthand != short {
				t.Errorf("%s: --%s shorthand = %q, want %q (Node)", path, long, f.Shorthand, short)
			}
		}

		local.VisitAll(func(f *pflag.Flag) {
			if f.Shorthand == "" {
				return
			}
			if f.Name == "help" || f.Name == "version" {
				return // cobra's -h/-v, matching Node's reserved set
			}
			if want[f.Name] == f.Shorthand || extra[f.Name] == f.Shorthand {
				return
			}
			t.Errorf("%s: --%s carries an unexpected -%s; Node gives it %q",
				path, f.Name, f.Shorthand, want[f.Name])
		})
	}

	// Guard against the table rotting when a command is removed.
	for path := range nodeShortFlags {
		if _, ok := tree[path]; !ok {
			names := make([]string, 0, len(tree))
			for p := range tree {
				names = append(names, p)
			}
			sort.Strings(names)
			t.Errorf("nodeShortFlags lists %q which is not in the command tree (have %v)", path, names)
		}
	}
}

// Node adds -v/--version to EVERY subcommand (command.js:1103-1107), not just
// the root; it prints the version and exits 0.
func TestVersionFlagOnEverySubcommand(t *testing.T) {
	for path, c := range commandTree(t) {
		if c.Name() == "help" || strings.HasPrefix(c.Name(), "__complete") {
			continue // cobra internals, not part of the Node surface
		}
		f := c.LocalFlags().Lookup("version")
		if f == nil {
			t.Errorf("%s: no --version flag", path)
			continue
		}
		if f.Shorthand != "v" {
			t.Errorf("%s: --version shorthand = %q, want \"v\"", path, f.Shorthand)
		}
	}
}

// Node's --debug is `-d, --debug [value]`: bare enables every namespace,
// `--debug=ns1,ns2` scopes it (command.js:557-559 ->
// debugLib.enable(options.debug === true ? '*' : options.debug)).
func TestDebugAcceptsNamespaceList(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"--debug"}, "*"},
		{[]string{"-d"}, "*"},
		{[]string{"--debug=ns1,ns2"}, "ns1,ns2"},
		{[]string{"-d=ns1,ns2"}, "ns1,ns2"},
	}
	for _, tc := range cases {
		root := newRootCmd(&rootContext{})
		if err := root.ParseFlags(tc.args); err != nil {
			t.Fatalf("%q: %v", tc.args, err)
		}
		got, err := root.Flags().GetString("debug")
		if err != nil {
			t.Fatalf("%q: --debug is not a string flag: %v", tc.args, err)
		}
		if got != tc.want {
			t.Errorf("%q => --debug %q, want %q", tc.args, got, tc.want)
		}
	}

	// And it must be inherited by subcommands, as in Node where every bin
	// registers it.
	root := newRootCmd(&rootContext{})
	c, rest, err := root.Find([]string{"whoami", "-d"})
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ParseFlags(rest); err != nil {
		t.Fatalf("whoami -d: %v", err)
	}
}

// Node keeps --force on the commands whose confirmation gate came from
// requireConfirm (command.js:1086-1088). vip-next renamed the gate to
// --skip-confirmation; --force must still parse.
func TestForceIsAcceptedAliasOfSkipConfirmation(t *testing.T) {
	for _, path := range [][]string{
		{"sync"},
		{"import", "media"},
		{"import", "media", "abort"},
	} {
		for _, spelling := range []string{"--force", "--skip-confirmation", "-f"} {
			root := newRootCmd(&rootContext{})
			c, rest, err := root.Find(append(append([]string{}, path...), spelling))
			if err != nil {
				t.Fatalf("%v: %v", path, err)
			}
			if err := c.ParseFlags(rest); err != nil {
				t.Fatalf("vip %s %s: %v", strings.Join(path, " "), spelling, err)
			}
			v, err := c.Flags().GetBool("skip-confirmation")
			if err != nil {
				t.Fatalf("vip %s: %v", strings.Join(path, " "), err)
			}
			if !v {
				t.Errorf("vip %s %s did not set the confirmation bypass", strings.Join(path, " "), spelling)
			}
		}
	}
}

// CUTOVER ITEM 1.4 — a DELIBERATE divergence that must survive the --force
// alias work. In Node --force is a commander boolean, so `--force=false` is
// not recognized as a value form; the truthy string "false" leaks through and
// SKIPS the prompt. vip-next parses it as a real bool, so `--force=false`
// still prompts. Aliasing --force onto --skip-confirmation must not turn it
// into an optional-value/string flag, which would resurrect Node's bug.
func TestForceEqualsFalseStillPrompts(t *testing.T) {
	for _, path := range [][]string{{"sync"}, {"import", "media"}, {"import", "media", "abort"}} {
		for _, spelling := range []string{"--force=false", "--skip-confirmation=false"} {
			root := newRootCmd(&rootContext{})
			argv := prepareArgs(root, append(append([]string{}, path...), spelling))
			c, rest, err := root.Find(argv)
			if err != nil {
				t.Fatal(err)
			}
			if err := c.ParseFlags(rest); err != nil {
				t.Fatalf("vip %s %s: %v", strings.Join(path, " "), spelling, err)
			}
			// GetBool errors if the gate ever became a string/optional-value
			// flag — which is exactly how Node's bug would come back.
			v, err := c.Flags().GetBool("skip-confirmation")
			if err != nil {
				t.Fatalf("vip %s: --skip-confirmation must stay a real bool: %v",
					strings.Join(path, " "), err)
			}
			if v {
				t.Errorf("vip %s %s bypassed the prompt; Node's truthy-string bug must NOT be ported",
					strings.Join(path, " "), spelling)
			}
		}
	}
}

// The -a/-e shorthands are command-local flags that SHADOW root's persistent
// --app/--env. If that shadowing broke the @app.env plumbing, every aliased
// invocation would silently lose its target, so pin both directions.
func TestAliasPopulatesTheLocalAppEnvFlags(t *testing.T) {
	rc := &rootContext{aliasApp: "myapp", aliasEnv: "develop"}
	root := newRootCmd(rc)
	c, rest, err := root.Find([]string{"sync"})
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ParseFlags(rest); err != nil {
		t.Fatal(err)
	}
	if err := root.PersistentPreRunE(c, rest); err != nil {
		t.Fatalf("PersistentPreRunE: %v", err)
	}
	if got := c.Flag("app").Value.String(); got != "myapp" {
		t.Errorf("--app = %q, want %q (alias never reached the leaf)", got, "myapp")
	}
	if got := c.Flag("env").Value.String(); got != "develop" {
		t.Errorf("--env = %q, want %q (alias never reached the leaf)", got, "develop")
	}

	// And the alias+flag conflict guard must still fire against the SHORT
	// spelling, which only the leaf-local flag can observe.
	root2 := newRootCmd(&rootContext{aliasApp: "myapp"})
	c2, rest2, err := root2.Find([]string{"sync", "-a", "other"})
	if err != nil {
		t.Fatal(err)
	}
	if err := c2.ParseFlags(rest2); err != nil {
		t.Fatal(err)
	}
	if err := root2.PersistentPreRunE(c2, rest2); err == nil {
		t.Error("alias + -a should be rejected")
	}
}

// src/bin/vip-wp.js registers `--yes`, and createOptionDefinition derives -y
// for it. `vip wp` runs with DisableFlagParsing, so the vip-level token has to
// be lifted out of argv by normalizeWPArgs — the short spelling included. A -y
// that appears AFTER the wp token belongs to the WP-CLI command and must be
// passed through untouched.
func TestNormalizeWPArgsAcceptsShortYes(t *testing.T) {
	cases := []struct {
		name     string
		in       []string
		wantArgv []string
		wantYes  bool
	}{
		{"short yes before dash", []string{"-y", "--", "wp", "user", "list"}, []string{"wp", "user", "list"}, true},
		{"short yes plain", []string{"-y", "wp", "user", "list"}, []string{"wp", "user", "list"}, true},
		{"short yes after wp stays in the WP-CLI command",
			[]string{"wp", "post", "delete", "1", "-y"}, []string{"wp", "post", "delete", "1", "-y"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotArgv, gotYes := normalizeWPArgs(tc.in)
			if strings.Join(gotArgv, " ") != strings.Join(tc.wantArgv, " ") {
				t.Errorf("argv = %v, want %v", gotArgv, tc.wantArgv)
			}
			if gotYes != tc.wantYes {
				t.Errorf("yes = %v, want %v", gotYes, tc.wantYes)
			}
		})
	}
}

// Regression pin for the optional-value normalizer being wired into the real
// root, not just unit-tested in isolation.
func TestRootAppliesOptionalValueNormalization(t *testing.T) {
	root := newRootCmd(&rootContext{})
	argv := prepareArgs(root, []string{"dev-env", "create", "-p", "n", "--xdebug", "n"})
	c, rest, err := root.Find(argv)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.ParseFlags(rest); err != nil {
		t.Fatalf("parse: %v", err)
	}
	if v, _ := c.Flags().GetString("phpmyadmin"); v != "n" {
		t.Errorf("--phpmyadmin = %q, want \"n\"", v)
	}
	if v, _ := c.Flags().GetString("xdebug"); v != "n" {
		t.Errorf("--xdebug = %q, want \"n\"", v)
	}
	if n := len(c.Flags().Args()); n != 0 {
		t.Errorf("stray positionals after normalization: %q", c.Flags().Args())
	}
}
