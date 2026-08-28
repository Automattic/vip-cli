package auth

import (
	"os"
	"strings"
)

// ShouldBypassAuth reports whether this invocation may run WITHOUT an
// interactive login. It is the port of the argv scan in src/bin/vip.js:190-212.
//
// Scope matters more than the token list: in Node this decides exactly one
// thing — login flow, or not. Either way `runCmd()` gets full API access,
// because src/lib/api/http.ts re-reads the keychain on every request. A true
// return here therefore means "do not prompt", NOT "do not configure the API
// client"; main.go must still hand the command whatever token is stored.
//
// Node's scan really is flat over the whole argv (doesArgvHaveAtLeastOneParam
// is `argv.some(arg => params.includes(arg))`), so `config envvar get help`
// takes this branch on both CLIs. That is only benign because of the rule
// above.
func ShouldBypassAuth(argv []string) bool {
	hasHelp := contains(argv, "help", "-h", "--help")
	hasVersion := contains(argv, "-v", "--version")
	hasLogout := contains(argv, "logout")
	hasLogin := contains(argv, "login")
	hasDevEnv := contains(argv, "dev-env")
	hasSync := contains(argv, "sync")
	hasDeploy := contains(argv, "deploy")
	hasAppEnv := containsAppEnvArgument(argv)
	if hasHelp || hasVersion || hasLogout || hasLogin {
		return true
	}
	// vip.js:196-198 — isDevEnvCommandWithoutEnv. `hasSync` is vip-next-only:
	// `dev-env sync sql` pulls a production export, so it gets a login prompt
	// instead of Node's bare 401.
	if hasDevEnv && !hasAppEnv && !hasSync {
		return true
	}
	if hasDeploy && os.Getenv("WPVIP_DEPLOY_TOKEN") != "" {
		return true
	}
	return false
}

func contains(argv []string, needles ...string) bool {
	set := map[string]struct{}{}
	for _, n := range needles {
		set[n] = struct{}{}
	}
	for _, a := range argv {
		if _, ok := set[a]; ok {
			return true
		}
	}
	return false
}

// containsAppEnvArgument ports containsAppEnvArgument
// (src/lib/cli/command.js:1128-1134):
//
//	parsedAlias.app || parsedAlias.env || argv.includes('--app') || argv.includes('--env')
//
// The two halves have deliberately different reach, and both are reproduced:
// parseEnvAliasFromArgv only looks BEFORE `--` (envAlias.ts:41-47), while the
// flag check is a plain exact-token scan of the whole argv. Consequences, all
// Node's: `--app=example` is missed, and a `--app` after `--` counts.
func containsAppEnvArgument(argv []string) bool {
	if containsAlias(argv) {
		return true
	}
	return contains(argv, "--app", "--env")
}

func containsAlias(argv []string) bool {
	for _, a := range argv {
		if a == "--" {
			return false
		}
		if strings.HasPrefix(a, "@") && len(a) > 1 {
			return true
		}
	}
	return false
}
