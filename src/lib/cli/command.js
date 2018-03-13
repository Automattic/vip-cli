// @flow

/**
 * External dependencies
 */
import args from 'args';
import inquirer from 'inquirer';
import colors from 'colors';
import gql from 'graphql-tag';
import updateNotifier from 'update-notifier';

/**
 * Internal dependencies
 */
import type { Tuple } from './prompt';
import API from 'lib/api';
import app from 'lib/api/app';
import Repo from './repo';
import { formatData } from './format';
import { confirm } from './prompt';
import pkg from 'root/package.json';

function uncaughtError( err ) {
	console.log();
	console.log( ' ', colors.red( '✕' ), ' Please contact VIP Support with the following error:' );
	console.log( ' ', colors.dim( err.stack ) );
}
process.on( 'uncaughtException', uncaughtError );
process.on( 'unhandledRejection', uncaughtError );

let _opts = {};
args.argv = async function( argv, cb ): Promise<any> {
	const options = this.parse( argv );

	const validationError = validateOpts( options );
	if ( validationError ) {
		console.log( validationError.toString() );
		process.exit( 1 );
	}

	// If there's a sub-command, run that instead
	if ( this.isDefined( this.sub[ 0 ], 'commands' ) ) {
		return {};
	}

	// Check for updates every day
	updateNotifier( { pkg, updateCheckInterval: 1000 * 60 * 60 * 24 } ).notify();

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
	let res;
	if ( _opts.appContext ) {
		if ( ! options.app ) {
			const repo = await Repo();
			const api = await API();

			try {
				res = await api
					.query( {
						// $FlowFixMe: gql template is not supported by flow
						query: gql`query Repo( $name: String ) {
							repo( name: $name ) {
								name, apps {
									total
									nextCursor
									edges {
										${ _opts.appQuery }
									}
								}
							}
						}`,
						variables: {
							name: repo,
						},
					} );
			} catch ( err ) {
				console.log( err.toString() );
				return;
			}

			const apps = res.data.repo.apps.edges;
			if ( ! apps || ! apps || ! apps.length ) {
				try {
					res = await api
						.query( {
							// $FlowFixMe: gql template is not supported by flow
							query: gql`query Apps( $first: Int, $after: String ) {
								apps( first: $first, after: $after ) {
									total
									nextCursor
									edges {
										${ _opts.appQuery }
									}
								}
							}`,
							variables: {
								first: 10,
								after: null, // TODO make dynamic?
							},
						} );
				} catch ( err ) {
					console.log( err.toString() );
					return;
				}

				if ( ! res ||
					! res.data ||
					! res.data.apps ||
					! res.data.apps.edges ||
					! res.data.apps.edges.length ) {
					console.log( "Couldn't find any apps" );
					return {};
				}

				const a = await inquirer.prompt( {
					type: 'list',
					name: 'app',
					message: 'Which app?',
					pageSize: 10,
					prefix: '',
					choices: res.data.apps.edges.map( cur => {
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

				options.app = Object.assign( {}, a.app );
			} else if ( apps.length === 1 ) {
				options.app = Object.assign( {}, apps.pop() );
			} else if ( apps.length > 1 ) {
				const a = await inquirer.prompt( {
					type: 'list',
					name: 'app',
					message: 'Which app?',
					pageSize: 10,
					prefix: '',
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

				options.app = Object.assign( {}, a.app );
			}
		} else {
			let a;
			try {
				a = await app( options.app, _opts.appQuery );
			} catch ( e ) {
				console.log( `App ${ colors.blue( options.app ) } does not exist` );
				return {};
			}

			if ( ! a || ! a.id ) {
				console.log( `App ${ colors.blue( options.app ) } does not exist` );
				return {};
			}

			options.app = Object.assign( {}, a );
		}

		if ( _opts.childEnvContext ) {
			options.app.environments = options.app.environments.filter( cur => cur.name.toLowerCase() !== 'production' );
		}
	}

	if ( ( _opts.envContext || _opts.childEnvContext ) && options.app ) {
		if ( options.env ) {
			if ( _opts.childEnvContext && options.env.toLowerCase() === 'production' ) {
				console.log( 'Environment production is not allowed for this command' );
				return {};
			}

			const env = options.app.environments.find( cur => cur.name === options.env );

			if ( ! env ) {
				console.log( `Environment ${ colors.blue( options.env ) } for app ${ colors.blue( options.app.name ) } does not exist` );
				return {};
			}

			options.env = env;
		} else if ( ! options.app || ! options.app.environments || ! options.app.environments.length ) {
			if ( _opts.childEnvContext ) {
				console.log( `Could not find any child environments for ${ colors.blue( options.app.name ) }` );
			} else {
				console.log( `Could not find any environments for ${ colors.blue( options.app.name ) }` );
			}

			return {};
		} else if ( options.app.environments.length === 1 ) {
			options.env = options.app.environments.pop();
		} else if ( options.app.environments.length > 1 ) {
			const e = await inquirer.prompt( {
				type: 'list',
				name: 'env',
				message: 'Which environment?',
				pageSize: 10,
				prefix: '',
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

		let message = 'Are you sure?';
		if ( 'string' === typeof( _opts.requireConfirm ) ) {
			message = _opts.requireConfirm;
		}

		const yes = await confirm( info, message );
		if ( ! yes ) {
			return {};
		}
	}

	if ( cb ) {
		res = await cb( this.sub, options );

		if ( _opts.format && res ) {
			res = res.map( row => {
				const out = Object.assign( {}, row );

				if ( out.__typename ) {
					// Apollo injects __typename
					delete out.__typename;
				}

				return out;
			} );

			console.log( formatData( res, options.format ) );
			return {};
		}
	}

	return options;
};

function validateOpts( opts: any ): Error {
	if ( opts.app ) {
		if ( typeof( opts.app ) !== 'string' && typeof( opts.app ) !== 'number' ) {
			return new Error( 'Invalid --app' );
		}

		if ( opts.app.length < 1 ) {
			return new Error( 'Invalid --app' );
		}
	}

	if ( opts.env ) {
		if ( typeof( opts.env ) !== 'string' && typeof( opts.env ) !== 'number' ) {
			return new Error( 'Invalid --env' );
		}

		if ( opts.env.length < 1 ) {
			return new Error( 'Invalid --env' );
		}
	}
}

export default function( opts: any ): args {
	_opts = Object.assign( {
		appContext: false,
		appQuery: 'id,name',
		childEnvContext: false,
		envContext: false,
		format: false,
		requireConfirm: false,
		requiredArgs: 0,
	}, opts );

	const a = args;

	if ( _opts.appContext || _opts.requireConfirm ) {
		a.option( 'app', 'Specify the app' );
	}

	if ( _opts.envContext || _opts.childEnvContext ) {
		a.option( 'env', 'Specify the environment' );
	}

	if ( _opts.requireConfirm ) {
		a.option( 'force', 'Skip confirmation', false );
	}

	if ( _opts.format ) {
		a.option( 'format', 'Format results', 'table' );
	}

	return a;
}
