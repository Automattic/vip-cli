const args = require( 'args' );
const promptly = require( 'promptly' );

// ours
const repo = require( './repo' );
const format = require( './format' );

let _opts = {};

args.argv = async function( argv, cb ) {
	const options = this.parse( argv );

	// If there's a sub-command, run that instead
	if ( this.isDefined( this.sub[ 0 ], 'commands' ) ) {
		return {};
	}

	// Show help if invalid subcommand
	const subCommands = this.details.commands.map( cmd => cmd.usage );
	const emptyCommand = this.details.commands.length <= 1;
	const emptyArgs = ! this.sub.length;
	const validSubCommand = 0 > subCommands.indexOf( this.sub[ 0 ] );

	if ( _opts.wildcardCommand && emptyArgs ) {
		return this.showHelp();
	}

	if ( ! emptyCommand && ( emptyArgs || ! validSubCommand ) ) {
		return this.showHelp();
	}

	// Set the site in options.app
	if ( _opts.appContext ) {
		let app = options.app;

		if ( ! app ) {
			const apps = await repo();

			if ( ! apps.apps || apps.apps.length !== 1 ) {
				return console.log( 'Please specify the app with --app' );
			}

			app = apps.apps.pop();
		} else {
			// TODO: Lookup the specified app in the API
		}

		options.app = app;
	}

	// Prompt for confirmation if necessary
	if ( _opts.requireConfirm && ! options.force ) {
		// TODO: Colorize environment
		console.log( 'App:', options.app );

		const yes = await promptly.confirm( 'Are you sure?' );
		if ( ! yes ) {
			return;
		}
	}

	if ( cb ) {
		const res = await cb( this.sub, options );

		if ( _opts.format && res ) {
			return console.log( format( res, options.format ) );
		}
	}

	return options;
};

module.exports = function( opts ) {
	_opts = Object.assign( {
		appContext: false,
		format: false,
		requireConfirm: false,
		wildcardCommand: false,
	}, opts );

	const a = args;

	if ( _opts.appContext || _opts.requireConfirm ) {
		a.option( 'app', 'Specify the app to sync' );
	}

	if ( _opts.requireConfirm ) {
		a.option( 'force', 'Skip confirmation' );
	}

	if ( _opts.format ) {
		a.option( 'format', 'Format results' );
	}

	return a;
};
