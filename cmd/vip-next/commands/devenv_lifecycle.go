package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/devlog"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/httpproxy"
	"github.com/Automattic/vip/internal/nodeflags"
)

// openDevEnvLog opens a per-env, per-invocation session log, points its footer
// at stdout, and returns a context carrying the logger plus a finish func that
// prints the "COMMAND LOG FILE" footer and closes the file. Best-effort: on
// failure it returns the command's context and a no-op finish, so logging never
// blocks the command. Callers should `defer finish()` so the footer prints last
// (after the info table), matching Node's on-exit log-path banner.
//
// When creating is false the env must already exist; otherwise we skip logging
// rather than scaffold a logs/ directory for a bogus slug (which AllNames would
// then surface as a phantom environment). create passes creating=true because
// the environment is about to be written.
func openDevEnvLog(cmd *cobra.Command, slug string, creating bool) (context.Context, func()) {
	if !creating && !instancedata.Exists(slug) {
		return cmd.Context(), func() {}
	}
	l, err := devlog.Open(slug)
	if err != nil {
		return cmd.Context(), func() {}
	}
	l.SetFooterWriter(cmd.OutOrStdout())
	return devlog.WithLogger(cmd.Context(), l), func() {
		l.Finish()
		_ = l.Close()
	}
}

func devEnvCreateCmd() *cobra.Command {
	c := &cobra.Command{
		Use:           "create",
		Short:         "Create a new local environment",
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE:          runDevEnvCreate,
	}
	f := c.Flags()
	addXdebugConfigAlias(c)
	f.StringP("slug", "s", "", "A unique name for the new local environment.")
	f.StringP("title", "t", "", "WordPress Site Title.")
	f.StringP("multisite", "m", "", `Create the environment as a multisite. Accepts "y" (default value) for a subdomain multisite, "subdirectory", or "n".`)
	f.String("php", "", "PHP image/version.")
	f.StringP("wordpress", "w", "", "WordPress version tag.")
	f.StringP("mu-plugins", "u", "", `Source for VIP MU plugins. Accepts "demo" (default) or a local path.`)
	f.StringP("app-code", "a", "", `Source for application code. Accepts "demo" (default) or a local path.`)
	addDevEnvServiceFlags(c)
	f.StringP("media-redirect-domain", "r", "", `Proxy media from a VIP Platform environment. Accepts a domain, or "n" to disable.`)
	// New environments pin compose.DefaultDomain ("vipdev.site"); only
	// pre-switch/Lando-adopted environments keep vipdev.lndo.site, so the help
	// text must not still promise the legacy domain.
	f.String("domain", "", "Custom domain (empty = "+compose.DefaultDomain+").")
	// Defaults FALSE, matching Node: `dev-env create` only writes files and
	// then prints "To start the environment run: vip dev-env start"
	// (vip-dev-env-create.js:173-179). Starting reaches sudo (/etc/hosts + CA
	// trust store, internal/devenv/hostops), which a create must never do
	// implicitly — it hangs CI on a sudo prompt. The flag itself is registered
	// vip-next surface and stays. See cutover register item 2.22.
	f.Bool("start", false, "Start the environment after creating it (Node's create only writes files).")
	// --multisite is one of Node's optional-value options: the bare form means
	// "y" (dev-environment-cli.ts:1012 block registers it with
	// processStringOrBooleanOption and no boolean default).
	nodeflags.MarkOptionalValue(c, "y", "multisite")
	return c
}

// devEnvServiceNames are the six y/n service toggles Node registers in
// addDevEnvConfigurationOptions (dev-environment-cli.ts:1012-1081), with the
// short aliases createOptionDefinition derives for them.
var devEnvServiceNames = []struct{ Name, Short, Usage string }{
	{"phpmyadmin", "p", `Enable or disable phpMyAdmin, disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
	{"xdebug", "x", `Enable or disable XDebug, disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
	{"elasticsearch", "e", `Enable or disable Elasticsearch (required by Enterprise Search), disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
	{"cron", "c", `Enable or disable cron, disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
	{"mailpit", "A", `Enable or disable Mailpit, disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
	{"photon", "H", `Enable or disable Photon, disabled by default. Accepts "y" (default value) to enable or "n" to disable.`},
}

// addDevEnvServiceFlags registers the service toggles with Node's grammar:
// STRING flags with an omitted-value default of "y", coerced through
// processBooleanOption. Registering them as cobra bools inverted them —
// pflag's NoOptDefVal="true" made `-p n` ENABLE the service and dropped the
// "n", and `--phpmyadmin=n` was a hard strconv.ParseBool error.
func addDevEnvServiceFlags(c *cobra.Command) {
	names := make([]string, 0, len(devEnvServiceNames))
	for _, s := range devEnvServiceNames {
		c.Flags().StringP(s.Name, s.Short, "", s.Usage)
		names = append(names, s.Name)
	}
	nodeflags.MarkOptionalValue(c, "y", names...)
}

// addXdebugConfigAlias registers Node's underscored `--xdebug_config`
// (dev-environment-cli.ts:1042) as the canonical name and keeps vip-next's
// earlier `--xdebug-config` spelling working as an alias.
func addXdebugConfigAlias(c *cobra.Command) {
	c.Flags().String("xdebug_config", "", "Override some default configuration settings for Xdebug. Accepts a string value that is assigned to the XDEBUG_CONFIG environment variable.")
	aliasFlagName(c, "xdebug-config", "xdebug_config")
}

// devEnvServiceFlag coerces a parsed y/n service toggle through Node's
// processBooleanOption.
func devEnvServiceFlag(cmd *cobra.Command, name string) bool {
	v, _ := cmd.Flags().GetString(name)
	return nodeflags.ProcessBooleanOption(v)
}

// devEnvMediaRedirectDomain applies processMediaRedirectDomainOption
// (dev-environment-cli.ts:948): "n"/"no"/"false"/"0" DISABLE the proxy,
// "y"/"yes"/"true"/"1" are a user error, anything else is the domain.
func devEnvMediaRedirectDomain(cmd *cobra.Command) (string, error) {
	raw, _ := cmd.Flags().GetString("media-redirect-domain")
	return nodeflags.ProcessMediaRedirectDomainOption(raw)
}

// devEnvXdebugConfig reads --xdebug_config (or its --xdebug-config alias).
func devEnvXdebugConfig(cmd *cobra.Command) (string, error) {
	return cmd.Flags().GetString("xdebug_config")
}

// devEnvComponentDir applies processComponentOptionInput
// (dev-environment-cli.ts:237) to --app-code / --mu-plugins: only a value
// containing a path separator is a local directory. "demo", "image" and any
// other bare word select an image, so they must NOT become bind-mount paths.
func devEnvComponentDir(cmd *cobra.Command, name string) string {
	raw, _ := cmd.Flags().GetString(name)
	return nodeflags.ProcessComponentOptionInput(raw, true).Dir
}

// devEnvWizardIntro mirrors Node's DEV_ENVIRONMENT_PROMPT_INTRO.
const devEnvWizardIntro = "This is a wizard to help you set up your local dev environment.\n\n" +
	"Sensible defaults are pre-selected; press Enter to accept each one. Pass the\n" +
	"matching flags (or --non-interactive) to skip the wizard, and use --slug to\n" +
	"create multiple environments with different settings.\n\n"

// devEnvPHPChoices are the offered PHP versions with Node's labels
// (DEV_ENVIRONMENT_PHP_VERSIONS); the value is the bare version, which NewView
// resolves to the php-fpm image. The first entry is the recommended default.
var devEnvPHPChoices = []struct{ Label, Version string }{
	{"8.2 (recommended)", "8.2"},
	{"8.3", "8.3"},
	{"8.4", "8.4"},
	{"8.5 (experimental)", "8.5"},
}

// validatePHPVersion ports resolvePhpVersion's rejection
// (dev-environment-cli.ts:778-782): an unsupported version must fail BEFORE the
// environment is written, otherwise a typo only surfaces later as an opaque
// `docker pull` failure with the environment already on disk.
//
// DELIBERATE SUPERSET: Node accepts only the four bare versions and their four
// canonical image strings. vip-next additionally lets an explicit image
// reference through verbatim (compose.phpImage's escape hatch), so validation
// applies to bare versions only — the typo case — and does not take away
// something that already worked.
func validatePHPVersion(php string) error {
	if php == "" || strings.ContainsAny(php, "/:") {
		return nil
	}
	for _, c := range devEnvPHPChoices {
		if c.Version == php {
			return nil
		}
	}
	return fmt.Errorf("Unknown or unsupported PHP version: %s.", php)
}

// phpLabels returns the wizard PHP choice labels in order.
func phpLabels() []string {
	labels := make([]string, len(devEnvPHPChoices))
	for i, c := range devEnvPHPChoices {
		labels[i] = c.Label
	}
	return labels
}

// phpVersionForLabel maps a wizard PHP label back to its bare version.
func phpVersionForLabel(label string) string {
	for _, c := range devEnvPHPChoices {
		if c.Label == label {
			return c.Version
		}
	}
	return label
}

// phpLabelForVersion maps a bare PHP version (or image tag) to its wizard label,
// or "" if unknown.
func phpLabelForVersion(version string) string {
	for _, c := range devEnvPHPChoices {
		if c.Version == version {
			return c.Label
		}
	}
	return ""
}

// selectWithDefault prompts with options, moving dflt to the front so it is the
// pre-selected default when present; otherwise the first option is the default.
func selectWithDefault(cmd *cobra.Command, message string, options []string, dflt string) (string, error) {
	if dflt != "" {
		reordered := make([]string, 0, len(options))
		found := false
		for _, o := range options {
			if o == dflt {
				found = true
				break
			}
		}
		if found {
			reordered = append(reordered, dflt)
			for _, o := range options {
				if o != dflt {
					reordered = append(reordered, o)
				}
			}
			options = reordered
		}
	}
	return appctx.Select(cmd, message, options)
}

// wordpressVersionsURL is the container-images version manifest the wizard
// lists. Node builds the same URL from DEV_ENVIRONMENT_RAW_GITHUB_HOST +
// DEV_ENVIRONMENT_WORDPRESS_VERSIONS_URI in fetchVersionList
// (dev-environment-core.ts:1040). A var, not a const, so the proxy-policy test
// can point it at a local server.
var wordpressVersionsURL = "https://raw.githubusercontent.com/Automattic/vip-container-images/master/wordpress/versions.json"

// wordpressVersionChoices returns the WordPress versions to offer in the wizard:
// "trunk" (the default) first, then the tags from the manifest. A failed/slow
// fetch degrades to just trunk so the wizard never blocks on the network.
func wordpressVersionChoices() []string {
	choices := []string{"trunk"}
	// Node hands exactly this request to createProxyAgent
	// (dev-environment-core.ts:1044), so it must follow vip-next's proxy policy
	// and not http.DefaultTransport's. See internal/httpproxy.
	c := httpproxy.ClientWithTimeout(5 * time.Second)
	resp, err := c.Get(wordpressVersionsURL)
	if err != nil {
		return choices
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return choices
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return choices
	}
	// trunk is already first; skip it (and any dup) from the manifest tags.
	seen := map[string]bool{"trunk": true}
	for _, tag := range parseWordPressTags(body) {
		if !seen[tag] {
			seen[tag] = true
			choices = append(choices, tag)
		}
	}
	return choices
}

// parseWordPressTags extracts the unique, non-empty `tag` values from the
// versions.json manifest, preserving the manifest's (newest-first) order.
func parseWordPressTags(body []byte) []string {
	var entries []struct {
		Tag string `json:"tag"`
	}
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil
	}
	seen := map[string]bool{}
	var tags []string
	for _, e := range entries {
		if e.Tag == "" || seen[e.Tag] {
			continue
		}
		seen[e.Tag] = true
		tags = append(tags, e.Tag)
	}
	return tags
}

func runDevEnvCreate(cmd *cobra.Command, _ []string) error {
	// When invoked as `@app.env dev-env create`, seed the wizard from the app's
	// environment (Node parity: getApplicationInformation + getOptionsFromAppInfo).
	// Best-effort: a nil result (no alias, or a failed fetch) falls back to the
	// generic defaults.
	defaults := fetchAppCreateDefaults(cmd)
	cfg, err := resolveCreateConfig(cmd, defaults)
	if err != nil {
		return err
	}
	ctx, finish := openDevEnvLog(cmd, cfg.Slug, true)
	defer finish()
	if err := devenv.Create(ctx, cfg); err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	// Print the env info table (Node parity: printEnvironmentInfo after create).
	if info, err := devenv.Info(ctx, cfg.Slug); err == nil {
		fmt.Fprint(out, info)
	}
	if cfg.Start {
		fmt.Fprintf(out, "\n✓ Environment %q created and started.\n", cfg.Slug)
	} else {
		fmt.Fprintf(out, "\n✓ Environment %q created.\n\nTo start the environment run:\n\n  %s\n", cfg.Slug, environmentStartCommand(cfg.Slug))
	}
	return nil
}

// environmentStartCommand ports getEnvironmentStartCommand
// (dev-environment-cli.ts:196-206): omit --slug when the slug came from the
// discovered configuration file, because `vip dev-env start` will resolve to
// the same environment there. Printing --slug for a configuration-file slug is
// not wrong, but printing it for a slug the file does NOT name would send the
// user at a different environment — and since `create` no longer starts by
// default, this line is how they start it.
func environmentStartCommand(slug string) string {
	if slug == "" {
		return "vip dev-env start"
	}
	if cfg, err := devenv.LoadConfigFile(); err == nil && cfg != nil && cfg.Slug == slug {
		return "vip dev-env start"
	}
	return "vip dev-env start --slug " + slug
}

// resolveCreateConfig builds the CreateConfig from flags, running the Node-style
// setup wizard for any field not passed as a flag when the session is
// interactive, and otherwise applying defaults. A field passed as a flag always
// wins (its prompt is skipped); non-interactive runs never prompt, so scripted
// `create` stays headless.
func resolveCreateConfig(cmd *cobra.Command, defaults *createDefaults) (devenv.CreateConfig, error) {
	f := cmd.Flags()
	interactive := appctx.IsInteractive(cmd)
	if interactive {
		fmt.Fprint(cmd.OutOrStdout(), devEnvWizardIntro)
	}

	var d createDefaults
	if defaults != nil {
		d = *defaults
	}

	var cfg devenv.CreateConfig

	// slug: flag → .wpvip/vip-dev-env.yml → prompt (default vip-local) →
	// default. Node runs create's slug through the same getEnvironmentName as
	// every other dev-env command (vip-dev-env-create.js:103), so a configured
	// repo creates the CONFIGURED environment — otherwise create and
	// start/destroy would target different environments in the same repo
	// (register item 2.21). processSlug lowercases the FLAG value
	// (dev-environment-cli.ts:979) so the on-disk directory and the compose
	// project name agree with Node's; the configuration file's slug is used
	// verbatim, as Node does.
	slug, _ := f.GetString("slug")
	if slug != "" {
		cfg.Slug = nodeflags.ProcessSlug(slug)
	} else {
		fromFile, err := configFileSlug(cmd)
		if err != nil {
			return cfg, err
		}
		switch {
		case fromFile != "":
			cfg.Slug = fromFile
		default:
			slug = "vip-local"
			if interactive {
				v, err := appctx.Input(cmd, "Environment slug", slug)
				if err != nil {
					return cfg, err
				}
				slug = v
			}
			cfg.Slug = nodeflags.ProcessSlug(slug)
		}
	}

	// title (default from app env name, else "VIP Dev").
	titleDefault := "VIP Dev"
	if d.Title != "" {
		titleDefault = d.Title
	}
	if f.Changed("title") {
		cfg.Title, _ = f.GetString("title")
	} else if interactive {
		v, err := appctx.Input(cmd, "WordPress site title", titleDefault)
		if err != nil {
			return cfg, err
		}
		cfg.Title = v
	} else {
		cfg.Title = titleDefault
	}

	// multisite (default from the app env, else single site). The prompt text
	// echoes the app's multisite status (Node: "Multisite (<title> IS/is NOT
	// multisite)").
	msDefaultChoice := "single site"
	if d.Multisite {
		msDefaultChoice = "subdomain"
	}
	msPrompt := "Multisite"
	if d.Title != "" {
		status := "is NOT"
		if d.Multisite {
			status = "IS"
		}
		msPrompt = fmt.Sprintf("Multisite (%s %s multisite)", d.Title, status)
	}
	if f.Changed("multisite") {
		ms, _ := f.GetString("multisite")
		cfg.MultisiteMode = normalizeMultisite(ms)
	} else if interactive {
		choice, err := selectWithDefault(cmd, msPrompt, []string{"single site", "subdomain", "subdirectory"}, msDefaultChoice)
		if err != nil {
			return cfg, err
		}
		cfg.MultisiteMode = normalizeMultisite(choice)
	} else {
		cfg.MultisiteMode = normalizeMultisite(msDefaultChoice)
	}

	// php (default from the app env, else recommended; empty => NewView resolves
	// to php-fpm:8.2). The wizard lists the versions with Node's
	// recommended/experimental labels, pre-selecting the app's version.
	if f.Changed("php") {
		cfg.PHP, _ = f.GetString("php")
		if err := validatePHPVersion(cfg.PHP); err != nil {
			return cfg, err
		}
	} else if interactive {
		sel, err := selectWithDefault(cmd, "PHP version", phpLabels(), phpLabelForVersion(d.PHP))
		if err != nil {
			return cfg, err
		}
		cfg.PHP = phpVersionForLabel(sel)
	} else {
		cfg.PHP = d.PHP
	}

	// wordpress (default from the app env, else trunk; empty => NewView resolves
	// to trunk). The wizard lists the available versions (fetched from the
	// container-images repo, with trunk first), pre-selecting the app's version.
	if f.Changed("wordpress") {
		cfg.WordPress, _ = f.GetString("wordpress")
	} else if interactive {
		v, err := selectWithDefault(cmd, "WordPress version", wordpressVersionChoices(), d.WordPress)
		if err != nil {
			return cfg, err
		}
		cfg.WordPress = v
	} else {
		cfg.WordPress = d.WordPress
	}

	// app-code local path (blank => demo/image).
	if f.Changed("app-code") {
		cfg.AppCodeDir = devEnvComponentDir(cmd, "app-code")
	} else if interactive {
		v, err := appctx.Input(cmd, "Path to local application code (blank for demo)", "")
		if err != nil {
			return cfg, err
		}
		cfg.AppCodeDir = v
	}

	// mu-plugins local path (blank => image).
	if f.Changed("mu-plugins") {
		cfg.MuPluginsDir = devEnvComponentDir(cmd, "mu-plugins")
	} else if interactive {
		v, err := appctx.Input(cmd, "Path to local mu-plugins (blank for image)", "")
		if err != nil {
			return cfg, err
		}
		cfg.MuPluginsDir = v
	}

	// Boolean service toggles (default off).
	var berr error
	if cfg.Elasticsearch, berr = resolveCreateBool(cmd, "elasticsearch", "Enable Elasticsearch (needed by Enterprise Search)?"); berr != nil {
		return cfg, berr
	}
	if cfg.PHPMyAdmin, berr = resolveCreateBool(cmd, "phpmyadmin", "Enable phpMyAdmin?"); berr != nil {
		return cfg, berr
	}
	if cfg.Xdebug, berr = resolveCreateBool(cmd, "xdebug", "Enable Xdebug?"); berr != nil {
		return cfg, berr
	}
	if cfg.Mailpit, berr = resolveCreateBool(cmd, "mailpit", "Enable Mailpit?"); berr != nil {
		return cfg, berr
	}
	if cfg.Photon, berr = resolveCreateBool(cmd, "photon", "Enable Photon?"); berr != nil {
		return cfg, berr
	}
	if cfg.Cron, berr = resolveCreateBool(cmd, "cron", "Enable cron?"); berr != nil {
		return cfg, berr
	}

	// Non-prompted passthrough flags. media-redirect-domain defaults to the app
	// env's primary domain (Node getOptionsFromAppInfo.mediaRedirectDomain).
	cfg.XdebugConfig, _ = devEnvXdebugConfig(cmd)
	if f.Changed("media-redirect-domain") {
		v, err := devEnvMediaRedirectDomain(cmd)
		if err != nil {
			return cfg, err
		}
		cfg.MediaDomain = v
	} else {
		cfg.MediaDomain = d.MediaRedirectDomain
	}
	cfg.Domain, _ = f.GetString("domain")
	cfg.Start, _ = f.GetBool("start")
	return cfg, nil
}

// resolveCreateBool returns the coerced y/n flag when set, else prompts
// (interactive), else false. Never prompts in non-interactive mode (keeps
// scripted create headless).
func resolveCreateBool(cmd *cobra.Command, name, prompt string) (bool, error) {
	if cmd.Flags().Changed(name) {
		return devEnvServiceFlag(cmd, name), nil
	}
	if appctx.IsInteractive(cmd) {
		return appctx.Confirm(cmd, prompt, false)
	}
	return false, nil
}

// normalizeMultisite maps the Node --multisite values to
// CreateConfig.MultisiteMode via processStringOrBooleanOption
// (dev-environment-cli.ts:963): a truthy word means subdomain, a falsy word
// means single site, and any other string is the mode name itself.
func normalizeMultisite(s string) string {
	v := nodeflags.ProcessStringOrBooleanOption(s)
	if v.Kind == nodeflags.KindBool {
		if v.Bool {
			return "subdomain"
		}
		return ""
	}
	switch v.String {
	case "subdomain":
		return "subdomain"
	case "subdirectory":
		return "subdirectory"
	default:
		return ""
	}
}

func devEnvStartCmd() *cobra.Command {
	var skipRebuild, skipWPVersions, vscode bool
	var editor string
	c := &cobra.Command{Use: "start", Short: "Start a local environment", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			_ = skipWPVersions // accepted for Node parity; the Go port has no WP-version prompt to skip.
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			ctx, finish := openDevEnvLog(cmd, slug, false)
			defer finish()

			// One-time Lando adoption: detect a pre-existing Lando footprint for
			// this slug and, on confirmation, hand it to the Go engine before start.
			startOpts := devenv.StartOptions{SkipRebuild: skipRebuild}
			if plan, perr := devenv.PlanLandoMigration(ctx, slug); perr != nil {
				// Best-effort: a detection failure must never block a normal start.
				fmt.Fprintf(cmd.ErrOrStderr(), "note: could not check for a pre-existing Lando environment: %v\n", perr)
			} else if plan.Detected {
				if skip, _ := cmd.Flags().GetBool("skip-confirmation"); !skip {
					msg := fmt.Sprintf("Found an existing Lando environment %q. vip-next will take it over — reusing its database and removing the old Lando containers (your data volume is kept). This process is irreversible. Continue?", slug)
					confirmed, cerr := appctx.Confirm(cmd, msg, false)
					if cerr == appctx.ErrNonInteractive || (!confirmed && cerr == nil) {
						fmt.Fprintln(cmd.OutOrStdout(), "Command cancelled")
						return nil
					}
					if cerr != nil {
						return cerr
					}
				}
				startOpts.Lando = &plan
			}

			if err := devenv.Start(ctx, slug, startOpts); err != nil {
				return err
			}
			// Node keeps --vscode as a deprecated spelling of
			// --editor=vscode (src/bin/vip-dev-env-start.js:70,86).
			if editor == "" && vscode {
				editor = "vscode"
			}
			if editor != "" {
				ws, err := devenv.GenerateEditorWorkspace(slug, editor)
				if err != nil {
					return err
				}
				fmt.Fprintf(cmd.OutOrStdout(), "Editor workspace written: %s\n", ws)
			}
			// Print the env info table (Node parity: printEnvironmentInfo after start).
			if info, err := devenv.Info(ctx, slug); err == nil {
				fmt.Fprint(cmd.OutOrStdout(), info)
			}
			return nil
		}}
	addSlugFlag(c)
	appctx.WithSkipConfirmationFlag(c) // registers --skip-confirmation (idempotent)
	c.Flags().BoolVar(&skipRebuild, "skip-rebuild", false, "Only start services that are not already in a running state.")
	c.Flags().BoolVarP(&skipWPVersions, "skip-wp-versions-check", "w", false, "Skip the WordPress version check (accepted; the Go port has no such prompt).")
	// Node gives --vscode no short: 'v' is reserved for --version
	// (RESERVED_AUTO_SHORT_ALIASES, src/lib/cli/command.js:42).
	c.Flags().BoolVar(&vscode, "vscode", false, "Generate a Visual Studio Code Workspace file (deprecated, use --editor=vscode instead).")
	c.Flags().StringVarP(&editor, "editor", "e", "", "Generate an editor workspace file (vscode, cursor, or windsurf).")
	return c
}

func devEnvStopCmd() *cobra.Command {
	var all bool
	c := &cobra.Command{Use: "stop", Short: "Stop a local environment", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if all {
				return devenv.StopAll(cmd.Context())
			}
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			return devenv.Stop(cmd.Context(), slug)
		}}
	addSlugFlag(c)
	c.Flags().BoolVarP(&all, "all", "a", false, "Stop all local environments.")
	return c
}

func devEnvDestroyCmd() *cobra.Command {
	var yes, soft bool
	c := &cobra.Command{Use: "destroy", Short: "Remove a local environment", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			if !yes {
				msg := fmt.Sprintf("Destroy environment %q? This deletes its data.", slug)
				if soft {
					msg = fmt.Sprintf("Destroy environment %q? Its configuration files are kept (--soft).", slug)
				}
				ok, err := appctx.Confirm(cmd, msg, false)
				if err != nil {
					return err
				}
				if !ok {
					return nil
				}
			}
			return devenv.Destroy(cmd.Context(), slug, soft)
		}}
	addSlugFlag(c)
	c.Flags().BoolVar(&yes, "yes", false, "Skip the confirmation prompt.")
	c.Flags().BoolVar(&soft, "soft", false, "Preserve the environment's configuration files so it can be recreated.")
	return c
}

func devEnvInfoCmd() *cobra.Command {
	var all, extended bool
	c := &cobra.Command{Use: "info", Short: "Show information about a local environment", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			out := cmd.OutOrStdout()
			_ = extended // Node: "Deprecated, not used." (vip-dev-env-info.js:46)
			if all {
				s, err := devenv.InfoAll(cmd.Context())
				if err != nil {
					return err
				}
				fmt.Fprint(out, s)
				return nil
			}
			slug, err := ResolveSlug(cmd)
			if err != nil {
				return err
			}
			s, err := devenv.Info(cmd.Context(), slug)
			if err != nil {
				return err
			}
			fmt.Fprint(out, s)
			return nil
		}}
	addSlugFlag(c)
	c.Flags().BoolVarP(&all, "all", "a", false, "Show information about all local environments.")
	c.Flags().BoolVarP(&extended, "extended", "e", false, "Deprecated, not used.")
	return c
}

func devEnvListCmd() *cobra.Command {
	return &cobra.Command{Use: "list", Short: "List local environments", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			envs, err := devenv.List(cmd.Context())
			if err != nil {
				return err
			}
			out := cmd.OutOrStdout()
			if len(envs) == 0 {
				fmt.Fprintln(out, "No local environments found.")
				return nil
			}
			fmt.Fprintf(out, "%-30s %s\n", "SLUG", "STATUS")
			for _, e := range envs {
				status := "stopped"
				if e.Running {
					status = "running"
				}
				fmt.Fprintf(out, "%-30s %s\n", e.Slug, status)
			}
			return nil
		}}
}

func devEnvPurgeCmd() *cobra.Command {
	var yes, force, soft bool
	c := &cobra.Command{Use: "purge", Short: "Remove all local environments and shared services", SilenceUsage: true, SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !yes && !force {
				ok, err := appctx.Confirm(cmd, "Purge ALL local environments and shared services? This deletes all data.", false)
				if err != nil {
					return err
				}
				if !ok {
					return nil
				}
			}
			return devenv.Purge(cmd.Context(), soft)
		}}
	c.Flags().BoolVar(&yes, "yes", false, "Skip the confirmation prompt.")
	c.Flags().BoolVarP(&force, "force", "f", false, "Skip the confirmation prompt (alias of --yes).")
	c.Flags().BoolVarP(&soft, "soft", "s", false, "Preserve every environment's configuration files.")
	return c
}
