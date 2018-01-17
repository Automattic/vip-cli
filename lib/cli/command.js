const args = require( 'args' );

// ours
const repo = require( './repo' );

let _opts = {};

args.argv = async function( argv, cb ) {
	const options = this.parse( argv );

	if ( ! _opts.empty && ! this.sub.length ) {
		this.showHelp();
	}

	if ( _opts.app ) {
		let app = options.app;
		if ( ! app ) {
			const apps = await repo();

			if ( ! apps.apps || apps.apps.length !== 1 ) {
				return console.log( 'Please specify the app with --app' );
			}

			app = apps.apps.pop();
		}
		options.app = app;
	}

	if ( cb ) {
		await cb( this.sub, options );
	}

	return options;
};

module.exports = function( opts ) {
	_opts = Object.assign( {
		app: false,
		empty: false,
		force: false,
	}, opts );

	const a = args;

	if ( _opts.app || _opts.force ) {
		a.option( 'app', 'Specify the app to sync' );
	}

	if ( _opts.force ) {
		a.option( 'force', 'Force' );
	}

	return a;
};
