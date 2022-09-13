/**
 * External dependencies
 */

exports.isAlias = function( alias ) {
	return /^@[A-Za-z0-9\.\-]+$/.test( alias );
};

exports.parseEnvAlias = function( alias ) {
	if ( ! exports.isAlias( alias ) ) {
		throw new Error( 'Invalid environment alias. Aliases are in the format of @app-name or @app-name.environment-name' );
	}

	// Remove the '@'
	const stripped = alias.substr( 1 ).toLowerCase();

	// in JS, .split() with a limit discards the extra ones, so can't use it
	// Also convert to lowercase because mixed case environment names would cause problems
	const [ app, ...rest ] = stripped.split( '.' );

	let env = undefined;

	// Rejoin the env on '.' (if present), to handle instance names (env.instance-01)
	if ( rest && rest.length ) {
		env = rest.join( '.' );
	}

	return { app, env };
};

exports.parseEnvAliasFromArgv = function( processArgv ) {
	// Clone to not affect original arvg
	const argv = ( processArgv.slice( 0 ) );

	// If command included a `--` to indicate end of named args, lets only consider aliases
	// _before_ it, so that it can be passed to other commands directly
	const dashDashIndex = argv.indexOf( '--' );

	let argsBeforeDashDash = argv;

	if ( dashDashIndex > -1 ) {
		argsBeforeDashDash = argv.slice( 0, dashDashIndex );
	}

	const alias = argsBeforeDashDash.find( arg => exports.isAlias( arg ) );

	if ( ! alias ) {
		return { argv };
	}

	// If we did have an alias, split it up into app/env
	const parsedAlias = exports.parseEnvAlias( alias );

	// Splice out the alias
	argv.splice( argv.indexOf( alias ), 1 );

	return { argv, ...parsedAlias };
};
