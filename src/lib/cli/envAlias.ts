/**
 * External dependencies
 */

export function isAlias( alias: string ): boolean {
	return /^@[A-Za-z0-9.-]+$/.test( alias );
}

export function parseEnvAlias( alias: string ) {
	if ( ! isAlias( alias ) ) {
		throw new Error(
			'Invalid environment alias. Aliases are in the format of @app-name or @app-name.environment-name'
		);
	}

	// Remove the '@'
	const stripped = alias.slice( 1 ).toLowerCase();

	// in JS, .split() with a limit discards the extra ones, so can't use it
	// Also convert to lowercase because mixed case environment names would cause problems
	const [ app, ...rest ] = stripped.split( '.' );

	let env;

	// Rejoin the env on '.' (if present), to handle instance names (env.instance-01)
	if ( rest.length ) {
		env = rest.join( '.' );
	}

	return { app, env };
}

interface ParsedAlias {
	argv: string[];
	app?: string;
	env?: string;
}

export function parseEnvAliasFromArgv( processArgv: string[] ): ParsedAlias {
	// Clone to not affect original arvg
	const argv = processArgv.slice( 0 );

	// If command included a `--` to indicate end of named args, lets only consider aliases
	// _before_ it, so that it can be passed to other commands directly
	const dashDashIndex = argv.indexOf( '--' );

	let argsBeforeDashDash = argv;

	if ( dashDashIndex > -1 ) {
		argsBeforeDashDash = argv.slice( 0, dashDashIndex );
	}

	const alias = argsBeforeDashDash.find( arg => isAlias( arg ) );

	if ( ! alias ) {
		return { argv };
	}

	// If we did have an alias, split it up into app/env
	const parsedAlias = parseEnvAlias( alias );

	// Splice out the alias
	argv.splice( argv.indexOf( alias ), 1 );

	return { argv, ...parsedAlias };
}
