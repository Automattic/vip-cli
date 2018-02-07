// @flow
const args = require( 'args' );
const inquirer = require( 'inquirer' );
const colors = require( 'colors' );

/**
 * internal dependencies
 */
import type { Tuple } from './prompt';

// ours
const app = require( '../api/app' );
const repo = require( './repo' );
const format = require( './format' );
const prompt = require( './prompt' );

let _opts = {};

args.argv = async function( argv, cb ): Promise<any> {
	const options = this.parse( argv );

	// If there's a sub-command, run that instead
	if ( this.isDefined( this.sub[ 0 ], 'commands' ) ) {
		return {};
	}

	// Show help if no args passed
	if ( this.details.commands.length > 1 && ! this.sub.length ) {
		this.showHelp();
		return {};
	}

	// Show help if required arg is missing
	if ( _opts.requiredArgs > this.sub.length ) {
		this.showHelp();
		return {};
	}

	// Show help if subcommand is invalid
	const subCommands = this.details.commands.map( cmd => cmd.usage );
	if ( this.sub[ _opts.requiredArgs ] &&
		0 > subCommands.indexOf( this.sub[ _opts.requiredArgs ] ) ) {
		this.showHelp();
		return {};
	}

	// Set the site in options.app
	if ( _opts.appContext ) {
		if ( ! options.app ) {
			let apps = await repo();

			if ( ! apps || ! apps.apps || ! apps.apps.length ) {
				apps = await app.apps();

				if ( ! apps ) {
					console.log( "Couldn't find any apps" );
					return {};
				}

				const a = await inquirer.prompt( {
					type: 'list',
					name: 'app',
					message: 'Which app?',
					pageSize: 10,
					choices: apps.map( cur => {
						return {
							name: cur.name,
							value: cur,
						};
					} ),
				} );

				if ( ! a || ! a.app || ! a.app.id ) {
					console.log( `App ${ colors.blue( a.app.name ) } does not exist` );
					return {};
				}

				options.app = a.app;
			} else if ( apps.apps.length === 1 ) {
				options.app = apps.apps.pop();
			} else if ( apps.apps.length > 1 ) {
				const a = await inquirer.prompt( {
					type: 'list',
					name: 'app',
					message: 'Which app?',
					pageSize: 10,
					choices: apps.apps.map( cur => {
						return {
							name: cur.name,
							value: cur,
						};
					} ),
				} );

				if ( ! a || ! a.app || ! a.app.id ) {
					console.log( `App ${ colors.blue( a.app.name ) } does not exist` );
					return {};
				}

				options.app = a.app;
			}
		} else {
			const a = await app( options.app );

			if ( ! a || ! a.id ) {
				console.log( `App ${ colors.blue( options.app ) } does not exist` );
				return {};
			}

			options.app = a;
		}
	}

	if ( _opts.envContext && options.app ) {
		if ( options.env ) {
			const env = options.app.environments.find( cur => cur.name === options.env );

			if ( ! env ) {
				console.log( `Environment ${ colors.blue( options.env ) } for app ${ colors.blue( options.app.name ) } does not exist` );
				return {};
			}

			options.env = env;
		} else if ( ! options.app || ! options.app.environments || ! options.app.environments.length ) {
			console.log( `Could not find any environments for ${ colors.blue( options.app.name ) }` );
			return {};
		} else if ( options.app.environments.length === 1 ) {
			options.env = options.app.environments.pop();
		} else if ( options.app.environments.length > 1 ) {
			const e = await inquirer.prompt( {
				type: 'list',
				name: 'env',
				message: 'Which environment?',
				pageSize: 10,
				choices: options.app.environments.map( cur => {
					return {
						name: cur.name,
						value: cur,
					};
				} ),
			} );

			if ( ! e || ! e.env || ! e.env.id ) {
				console.log( `App ${ colors.blue( e.env.name ) } does not exist` );
				return {};
			}

			options.env = e.env;
		}
	}

	// Prompt for confirmation if necessary
	if ( _opts.requireConfirm && ! options.force ) {
		const info: Array<Tuple> = [];

		if ( options.app ) {
			info.push( { key: 'app', value: options.app.name } );
		}

		if ( options.env ) {
			info.push( { key: 'environment', value: options.env.name } );
		}

		const yes = await prompt.confirm( info, 'Are you sure?' );
		if ( ! yes ) {
			return {};
		}
	}

	if ( cb ) {
		const res = await cb( this.sub, options );

		if ( _opts.format && res ) {
			console.log( format( res, options.format ) );
			return {};
		}
	}

	return options;
};

module.exports = function( opts: any ): args {
	_opts = Object.assign( {
		appContext: false,
		envContext: false,
		format: false,
		requireConfirm: false,
		requiredArgs: 0,
	}, opts );

	const a = args;

	if ( _opts.appContext || _opts.requireConfirm ) {
		a.option( 'app', 'Specify the app' );
	}

	if ( _opts.appContext || _opts.requireConfirm ) {
		a.option( 'env', 'Specify the environment' );
	}

	if ( _opts.requireConfirm ) {
		a.option( 'force', 'Skip confirmation' );
	}

	if ( _opts.format ) {
		a.option( 'format', 'Format results' );
	}

	return a;
};
