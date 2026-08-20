// Command vip-next is the Go rewrite of @automattic/vip.
//
// Bootstrap order (matches spec §4):
//
//  1. envalias.Rewrite consumes @app.env tokens from os.Args before cobra parses.
//  2. The rewritten argv is handed to a freshly constructed root cobra command.
//  3. Errors and panics route through internal/exit so the process never emits
//     a Go stack trace unless --debug is set.
//
// M1 ships --version and --help only; subcommands arrive in M2.
package main

import (
	"errors"
	"log/slog"
	"os"
	"strings"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/cmd/vip-next/commands"
	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/envalias"
	"github.com/Automattic/vip/internal/exit"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/nodeflags"
	"github.com/Automattic/vip/internal/rechallenge"
	"github.com/Automattic/vip/internal/telemetry"
)

func main() {
	defer func() {
		if r := recover(); r != nil {
			if err, ok := r.(error); ok {
				exit.WithError(err)
				return
			}
			exit.WithError(panicError{r})
		}
	}()

	if err := run(os.Args[1:]); err != nil {
		exit.WithError(err)
	}
}

type panicError struct{ v any }

func (p panicError) Error() string { return "internal error: panic recovered" }

func run(argv []string) error {
	tracker := telemetry.NewDefault()
	if tracker == nil {
		tracker = &telemetry.Tracker{Disabled: true}
	}
	exit.RegisterErrorHook(cliErrorHook(tracker))
	return runWithDeps(argv, productionRunDeps(tracker))
}

// cliErrorHook builds the exit hook that reports a failed invocation to
// analytics.
//
// NOTE FOR REVIEW — this event has no Node counterpart. The Node CLI registers
// no error hook and never sends error text anywhere, so everything this posts
// to public-api.wordpress.com is surface the Go rewrite added. Errors here
// routinely interpolate absolute local paths, and at least one path (a failed
// presigned download) used to interpolate a live credential, so the text is
// scrubbed before it leaves. See telemetry.ScrubErrorText for what goes.
//
// Scrubbing is the conservative fix. Deleting the hook is the parity-strict
// one; that call belongs to the repo owner, not to this change.
func cliErrorHook(tracker *telemetry.Tracker) func(error) {
	return func(err error) {
		tracker.TrackEvent("cli_error", map[string]any{
			"error": telemetry.ScrubErrorText(err.Error()),
		})
	}
}

func runWithDeps(argv []string, deps runDeps) error {
	rewritten, app, env, err := envalias.Rewrite(argv)
	if err != nil {
		return err
	}
	// Check for alias+flag conflict before handing off to cobra, because
	// --help short-circuits cobra's PersistentPreRunE pipeline.
	if app != "" || env != "" {
		if err := checkAliasConflict(rewritten, app, env); err != nil {
			return err
		}
	}
	rewritten, wpYes := normalizeWPArgs(rewritten)
	commands.SetWPYes(wpYes)

	// rootRef is captured by the rechallenge middleware's Interactive
	// closure (set below). The middleware only fires during Execute, so
	// rootRef is guaranteed non-nil by the time the closure runs in
	// production. The closure falls back to env-only detection if the
	// closure somehow fires pre-Execute (shouldn't happen, but defensive).
	var rootRef *cobra.Command
	executeRoot := func() error {
		rc := &rootContext{aliasApp: app, aliasEnv: env}
		rootRef = newRootCmd(rc)
		rootRef.SetArgs(prepareArgs(rootRef, rewritten))
		return rootRef.Execute()
	}

	// Auth bypass: if argv doesn't qualify, require a valid token. Use the
	// ORIGINAL argv (not `rewritten`) so the @app.env alias is still present —
	// ShouldBypassAuth keys off it to keep aliased dev-env commands (which must
	// resolve the app via the API, e.g. `dev-env create` wizard pre-population)
	// on the authed path. `rewritten` has the alias stripped, which would
	// wrongly bypass them.
	apiHost := defaultAPIHost()
	k := deps.NewKeychain(apiHost)
	store := auth.NewStore(k)
	if !auth.ShouldBypassAuth(argv) {
		return withAuthenticatedSession(!isNonInteractiveArgv(argv), authBootstrapDeps{
			Keychain: k,
			Store:    store,
			Login:    deps.NewLogin(store),
		}, func(session *authSession) error {
			configureAuthenticated(apiHost, session, deps.Tracker, &rootRef)
			return executeRoot()
		})
	}
	configureBypassed(apiHost, store, deps.Tracker)
	return executeRoot()
}

func configureAuthenticated(
	apiHost string,
	session *authSession,
	tracker *telemetry.Tracker,
	rootRef **cobra.Command,
) {
	// Share the same keychain backend, but a distinct service name so
	// elevated tokens live alongside the primary token.
	elevatedKeychain := &keychain.Keychain{
		Backend: session.Keychain.Backend,
		Service: rechallenge.ServiceNameForHost(apiHost),
	}
	elevatedCache := &rechallenge.TokenCache{Keychain: elevatedKeychain}
	rechallengeRunner := &rechallenge.Runner{
		Client:     &rechallenge.Client{APIHost: apiHost, BearerToken: session.Raw},
		TokenCache: elevatedCache,
	}
	// On logout (or any token Delete) clear the elevated-token cache.
	session.Store.OnDelete = elevatedCache.ClearAll

	// Middleware stack — outermost first, per the M3 contract:
	//   errorMiddleware → rechallengeMiddleware → retryMiddleware → transport.
	middleware := []gql.Middleware{
		gql.NewErrorMiddleware(gql.ErrorConfig{ExitOnError: true}),
		gql.NewRechallengeMiddleware(gql.RechallengeConfig{
			TokenCache: elevatedCache,
			Runner:     rechallengeRunner,
			Interactive: func() bool {
				if *rootRef == nil {
					return rechallenge.IsInteractiveContext(nil)
				}
				return appctx.IsInteractive(*rootRef)
			},
		}),
		gql.NewRetryMiddleware(gql.RetryConfig{}),
	}

	// Both raw POSTs and genqlient operations flow through the same chain.
	gqlHTTPClient := gql.HTTPClientWithMiddleware(apiHost, session.Raw, middleware)
	gqlClient := graphql.NewClient(apiHost+"/graphql", gqlHTTPClient)
	commands.SetConfig(commands.Config{
		APIHost:      apiHost,
		Token:        session.Raw,
		Middleware:   middleware,
		GQLClient:    gqlClient,
		Tracker:      tracker,
		AppCtxConfig: appctx.AppContextConfig{Client: gqlClient},
	})
}

// configureBypassed wires the runtime for an invocation that skipped the login
// flow. Node's vip.js bypass is ONLY about the prompt: `runCmd()` still calls
// the API, and src/lib/api/http.ts attaches `Bearer ${(await Token.get()).raw}`
// to every request whatever that token turns out to be — present, absent,
// expired. So a bypassed invocation gets the same client as an authed one, with
// two deliberate differences:
//
//   - the token is best-effort. A missing or unreadable credential yields an
//     empty bearer and the command 401s, exactly as Node does; it must never
//     turn into a hard error here, because `--version` and `--help` reach this
//     path on machines that have never logged in.
//   - no rechallenge middleware. Step-up approval needs a real session, and
//     nothing reachable without a login performs a step-up-guarded mutation.
//
// Before this, bypassed invocations got no GraphQL client at all, so anything
// whose argv merely contained "help"/"login"/"logout"/"-v" — `config envvar get
// help`, `wp help core`, `wp cli version` — died with "GraphQL client not
// configured" instead of running.
func configureBypassed(apiHost string, store *auth.Store, tracker *telemetry.Tracker) {
	raw, err := store.Load()
	if err != nil {
		// Best-effort: ErrNoToken is the common case, and a backend failure
		// (locked keyring, no D-Bus) must not break `vip --help`.
		slog.Debug("bypassed invocation has no usable token", "err", err)
		raw = ""
	}
	middleware := []gql.Middleware{
		gql.NewErrorMiddleware(gql.ErrorConfig{ExitOnError: true}),
		gql.NewRetryMiddleware(gql.RetryConfig{}),
	}
	gqlClient := graphql.NewClient(
		apiHost+"/graphql",
		gql.HTTPClientWithMiddleware(apiHost, raw, middleware),
	)
	commands.SetConfig(commands.Config{
		APIHost:      apiHost,
		Token:        raw,
		Middleware:   middleware,
		GQLClient:    gqlClient,
		Tracker:      tracker,
		AppCtxConfig: appctx.AppContextConfig{Client: gqlClient},
	})
}

// defaultAPIHost returns the VIP API host, preferring the API_HOST env var.
func defaultAPIHost() string {
	if h := os.Getenv("API_HOST"); h != "" {
		return h
	}
	return "https://api.wpvip.com"
}

// prepareArgs is the last argv reshaping step before cobra parses. It gives
// cobra commander's optional-value lookahead, which pflag has no equivalent
// for: with a NoOptDefVal set, `dev-env create -p n` would set --phpmyadmin to
// its omitted-value default and drop the "n" on the floor, inverting Node,
// where "n" DISABLES the service. See internal/nodeflags.
func prepareArgs(root *cobra.Command, argv []string) []string {
	return nodeflags.NormalizeOptionalValues(root, argv)
}

// normalizeWPArgs reshapes a post-envalias argv so cobra can route the
// `vip wp` command. wp is special: everything after the `wp` token is a
// raw WP-CLI command (with its own flags) that the wp command passes
// through verbatim (DisableFlagParsing). Two adjustments:
//
//   - Strip the FIRST bare "--" separator. The `@app.env -- wp ...` form
//     leaves a leading "--" (envalias preserves it); cobra's "--" would
//     otherwise block subcommand resolution so root never reaches wp.
//   - Extract a standalone "--yes" token that appears before the wp
//     command (vip-level flag, e.g. `@app.env --yes -- wp user list`);
//     return it separately since DisableFlagParsing keeps cobra from
//     parsing it.
//
// Only applies when the invocation targets wp (the first non-flag,
// non-"--" token is "wp"). Everything else passes through untouched.
func normalizeWPArgs(argv []string) (out []string, yes bool) {
	cmdIdx := -1
	for i, tok := range argv {
		if tok == "--" || strings.HasPrefix(tok, "-") {
			continue
		}
		cmdIdx = i
		break
	}
	if cmdIdx == -1 || argv[cmdIdx] != "wp" {
		return argv, false
	}
	out = make([]string, 0, len(argv))
	dashStripped := false
	for i, tok := range argv {
		if i >= cmdIdx {
			// tokens at cmdIdx onwards (the wp token + the raw WP-CLI
			// command, flags and all) are copied verbatim.
			out = append(out, tok)
			continue
		}
		if tok == "--" && !dashStripped {
			dashStripped = true
			continue
		}
		// Node registers --yes on vip-wp.js and createOptionDefinition
		// derives -y for it, so both spellings are vip-level tokens here.
		if tok == "--yes" || tok == "-y" {
			yes = true
			continue
		}
		out = append(out, tok)
	}
	return out, yes
}

// checkAliasConflict returns an error if --app or --env appear in argv when
// an @app.env alias was already parsed (i.e. both sources of app/env are set).
// This mirrors the PersistentPreRunE check in newRootCmd but runs before cobra
// so that --help cannot bypass the guard.
//
// Either alias field (app or env) colliding with either flag (--app or --env)
// is an error, matching Node's rejection of mixed alias+flag usage.
func checkAliasConflict(argv []string, aliasApp, aliasEnv string) error {
	hasAlias := aliasApp != "" || aliasEnv != ""
	if !hasAlias {
		return nil
	}
	for _, tok := range argv {
		if tok == "--" {
			break
		}
		if tok == "--app" || strings.HasPrefix(tok, "--app=") ||
			tok == "--env" || strings.HasPrefix(tok, "--env=") {
			return errors.New("cannot combine @app alias with --app/--env on the same invocation")
		}
	}
	return nil
}
