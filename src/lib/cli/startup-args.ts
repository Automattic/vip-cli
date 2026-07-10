/**
 * Pure helpers used by the CLI entrypoint (`src/bin/vip.js`) to classify the
 * incoming argv at startup and decide whether authentication is required before
 * dispatching a command. Extracted from the bin script so the branching logic
 * can be unit-tested in isolation.
 */

/**
 * Reports whether `argv` contains at least one of the given `params`.
 *
 * Only arguments _before_ a `--` terminator are considered: everything after
 * `--` is meant to be forwarded verbatim to a downstream command (e.g.
 * `vip wp @app.env -- --help`), so a matching token there must not be treated
 * as one of our own flags.
 *
 * @param argv   The process argv (or any argument list) to inspect.
 * @param params The parameters to look for (e.g. `[ '-h', '--help', 'help' ]`).
 * @return `true` if any param appears before `--`, otherwise `false`.
 */
export function doesArgvHaveAtLeastOneParam( argv: string[], params: string[] ): boolean {
	// Arguments after `--` belong to the wrapped command (e.g. `vip wp <env> -- --help`)
	// and must not classify the invocation itself as help/version/etc.
	const terminatorIndex = argv.indexOf( '--' );
	const ownArgs = terminatorIndex === -1 ? argv : argv.slice( 0, terminatorIndex );
	return ownArgs.some( arg => params.includes( arg ) );
}

/**
 * The set of startup classification flags derived from the argv. Each flag is a
 * boolean describing whether the current invocation matches a particular
 * special-case command.
 */
export interface StartupFlags {
	/** The user is running `login`. */
	isLoginCommand: boolean;
	/** The user is running `logout`. */
	isLogoutCommand: boolean;
	/** The user is requesting help (`help`, `-h`, `--help`). */
	isHelpCommand: boolean;
	/** The user is requesting the version (`-v`, `--version`). */
	isVersionCommand: boolean;
	/** The user is running `dev-env` without targeting an app/env. */
	isDevEnvCommandWithoutEnv: boolean;
	/** The user is running `deploy` with a `WPVIP_DEPLOY_TOKEN` set. */
	isCustomDeployCmdWithKey: boolean;
}

/**
 * Decides whether the stored authentication token needs to be read from the
 * keychain before dispatching the command.
 *
 * The token read is skipped for commands that never rely on the stored token:
 * `logout`, help, version, `dev-env` without an app/env, and a custom-deploy
 * invocation carrying its own token. `login` always requires the read path to
 * be taken so it proceeds through the login branch, even when combined with one
 * of the bypass flags above.
 *
 * @param flags The startup classification flags derived from the argv.
 * @return `true` when the token must be read, otherwise `false`.
 */
export function isTokenReadRequired( flags: StartupFlags ): boolean {
	const {
		isLoginCommand,
		isLogoutCommand,
		isHelpCommand,
		isVersionCommand,
		isDevEnvCommandWithoutEnv,
		isCustomDeployCmdWithKey,
	} = flags;

	return (
		isLoginCommand ||
		! (
			isLogoutCommand ||
			isHelpCommand ||
			isVersionCommand ||
			isDevEnvCommandWithoutEnv ||
			isCustomDeployCmdWithKey
		)
	);
}
