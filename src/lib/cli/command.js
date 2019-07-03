// @flow

/**
 * External dependencies
 */
import args from 'args';
import { prompt } from 'enquirer';
import chalk from 'chalk';
import gql from 'graphql-tag';
import updateNotifier from 'update-notifier';

/**
 * Internal dependencies
 */
import type { Tuple } from './prompt';
import API from 'lib/api';
import app from 'lib/api/app';
import { formatData } from './format';
import { confirm } from './prompt';
import pkg from 'root/package.json';
import { trackEvent } from 'lib/tracker';
import pager from 'lib/cli/pager';
import { parseEnvAliasFromArgv } from './envAlias';
import env from '../env';
import config from 'root/config/config.json';

const Rollbar = require( 'rollbar' );
const rollbar = new Rollbar( {
	accessToken: '99c8f982d64f47049fde6f6f9d567070',
	captureUncaught: true,
	captureUnhandledRejections: true,
	payload: {
		platform: 'client',
		cli_version: env.app.version,
		os_name: env.os.name,
		node_version: env.node.version,
		environment: config.environment,
	}
} );

function uncaughtError( err ) {
	// Error raised when trying to write to an already closed stream
	if ( err.code === 'EPIPE' ) {
		return;
	}

	console.log();
	console.log( ' ', chalk.red( '✕' ), ' Unexpected error: Please contact VIP Support with the following error:' );
	console.log( ' ', chalk.dim( err.stack ) );
}
process.on( 'uncaughtException', uncaughtError );
process.on( 'unhandledRejection', uncaughtError );

let _opts = {};
args.argv = async function( argv, cb ): Promise<any> {
	const parsedAlias = parseEnvAliasFromArgv( argv );

	const options = this.parse( parsedAlias.argv, { help: false, version: false } );

	if ( options.h || options.help ) {
		this.showHelp();
	}

	if ( options.v || options.version ) {
		this.showVersion();
	}

	// If we have both an --app/--env and an alias, we need to give a warning
	if ( parsedAlias.app && ( options.app || options.env ) ) {
		console.error( chalk`{red Please only use an envirionment alias, or the --app and --env parameters, but not both}` );

		process.exit();
	}

	// If there is an alias, use it to populate the app/env options
	if ( parsedAlias.app ) {
		options.app = parsedAlias.app;
		options.env = parsedAlias.env; // Can be undefined
	}

	const validationError = validateOpts( options );
	if ( validationError ) {
		const error = validationError.toString();

		await trackEvent( 'command_validation_error', { error } );

		console.log( error );
		process.exit( 1 );
	}

	// If there's a sub-command, run that instead
	if ( this.isDefined( this.sub[ 0 ], 'commands' ) ) {
		return {};
	}

	// Check for updates every day
	updateNotifier( { pkg, isGlobal: true, updateCheckInterval: 1000 * 60 * 60 * 24 } ).notify();

	// `help` and `version` are always defined as subcommands
	const customCommands = this.details.commands.filter( c => {
		switch ( c.usage ) {
			case 'help':
			case 'version':
				return false;

			default:
				return true;
		}
	} );

	// Show help if no args passed
	if ( !! customCommands.length && ! this.sub.length ) {
		await trackEvent( 'command_help_view' );

		this.showHelp();
		return {};
	}

	// Show help if required arg is missing
	if ( _opts.requiredArgs > this.sub.length ) {
		await trackEvent( 'command_validation_error', {
			error: 'Missing required arg',
		} );

		this.showHelp();
		return {};
	}

	// Show help if subcommand is invalid
	const subCommands = this.details.commands.map( cmd => cmd.usage );
	if ( ! _opts.wildcardCommand && this.sub[ _opts.requiredArgs ] &&
		0 > subCommands.indexOf( this.sub[ _opts.requiredArgs ] ) ) {
		const subcommand = this.sub.join( ' ' );

		await trackEvent( 'command_validation_error', {
			error: `Invalid subcommand: ${ subcommand }`,
		} );

		console.error( chalk.red( 'Error:' ), `\`${ subcommand }\` is not a valid subcommand. See \`vip --help\`` );
		return {};
	}

	// Set the site in options.app
	let res;
	if ( _opts.appContext ) {
		// If --app is not set, try to infer the app context
		if ( ! options.app ) {
			const api = await API();

			await trackEvent( 'command_appcontext_list_fetch' );

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
							first: 100,
							after: null, // TODO make dynamic?
						},
					} );
			} catch ( err ) {
				const message = err.toString();
				await trackEvent( 'command_appcontext_list_fetch_error', {
					error: message,
				} );

				console.log( `Failed to get app (${ _opts.appQuery }) details: ${ message }` );
				return;
			}

			if ( ! res ||
				! res.data ||
				! res.data.apps ||
				! res.data.apps.edges ||
				! res.data.apps.edges.length ) {
				await trackEvent( 'command_appcontext_list_fetch_error', {
					error: 'No apps found',
				} );

				console.log( "Couldn't find any apps" );
				return {};
			}

			const appNames = res.data.apps.edges.map( cur => cur.name );

			const a = await prompt( {
				type: 'autocomplete',
				name: 'app',
				message: 'Which app?',
				limit: 10,
				choices: appNames,
			} );

			// Copy all app information
			a.app = res.data.apps.edges.find( cur => cur.name === a.app );

			if ( ! a || ! a.app || ! a.app.id ) {
				await trackEvent( 'command_appcontext_list_select_error', {
					error: 'Invalid app selected',
				} );

				console.log( `App ${ chalk.blueBright( a.app.name ) } does not exist` );
				return {};
			}

			await trackEvent( 'command_appcontext_list_select_success' );

			options.app = Object.assign( {}, a.app );
		} else {
			let a;
			try {
				a = await app( options.app, _opts.appQuery );
			} catch ( e ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'App lookup failed',
				} );

				console.log( `App ${ chalk.blueBright( options.app ) } does not exist` );
				return {};
			}

			if ( ! a || ! a.id ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'Invalid app specified',
				} );

				console.log( `App ${ chalk.blueBright( options.app ) } does not exist` );
				return {};
			}

			await trackEvent( 'command_appcontext_param_select' );

			options.app = Object.assign( {}, a );
		}

		if ( _opts.childEnvContext ) {
			options.app.environments = options.app.environments.filter( cur => cur.id !== options.app.id );
		}
	}

	if ( ( _opts.envContext || _opts.childEnvContext ) && options.app ) {
		if ( options.env ) {
			if ( _opts.childEnvContext && options.env.toLowerCase() === 'production' ) {
				await trackEvent( 'command_childcontext_param_error', {
					error: 'Cannot use `production`',
				} );

				console.log( 'Environment production is not allowed for this command' );
				return {};
			}

			const env = options.app.environments.find( cur => cur.type === options.env );

			if ( ! env ) {
				await trackEvent( 'command_childcontext_param_error', {
					error: `Invalid child environment (${ options.env }) specified`,
				} );

				console.log( `Environment ${ chalk.blueBright( options.env ) } for app ${ chalk.blueBright( options.app.name ) } does not exist` );
				return {};
			}

			options.env = env;
		} else if ( ! options.app || ! options.app.environments || ! options.app.environments.length ) {
			console.log( `Could not find any non-production environments for ${ chalk.blueBright( options.app.name ) }.` );
			console.log( 'To set up a new development environment, please contact VIP Support.' );

			await trackEvent( 'command_childcontext_fetch_error', {
				error: 'No child environments found',
			} );

			return {};
		} else if ( options.app.environments.length === 1 ) {
			options.env = options.app.environments[ 0 ];
		} else if ( options.app.environments.length > 1 ) {
			const environmentNames = options.app.environments.map( envObject => getEnvIdentifier( envObject ) );
			const e = await prompt( {
				type: 'select',
				name: 'env',
				message: 'Which environment?',
				choices: environmentNames,
			} );

			// Get full environment info after user selection
			e.env = options.app.environments.find( envObject => getEnvIdentifier( envObject ) === e.env );

			if ( ! e || ! e.env || ! e.env.id ) {
				await trackEvent( 'command_childcontext_list_select_error', {
					error: 'Invalid environment selected',
				} );

				console.log( `Environment ${ chalk.blueBright( getEnvIdentifier( e.env ) ) } does not exist` );
				return {};
			}

			await trackEvent( 'command_childcontext_list_select_success' );

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
			info.push( { key: 'environment', value: getEnvIdentifier( options.env ) } );
		}

		let message = 'Are you sure?';
		if ( 'string' === typeof( _opts.requireConfirm ) ) {
			message = _opts.requireConfirm;
		}

		const { backup, canSync, errors } = options.env.syncPreview;

		if ( ! canSync ) {
			// User can not sync due to some error(s)
			// Shows the first error in the array
			console.log( `${ chalk.red( 'Error:' ) } Could not sync to this environment: ${ errors[ 0 ].message }` );
			return {};
		}

		// remove __typename from replacements.
		// can not be deleted afterwards if deconstructed
		const replacements = options.env.syncPreview.replacements.map( rep => {
			const { from, to } = rep;
			return { from, to };
		} );

		info.push( { key: 'From backup', value: new Date( backup.createdAt ).toUTCString() } );
		info.push( { key: 'Replacements', value: '\n' + formatData( replacements, 'table' ) } );

		const yes = await confirm( info, message );
		if ( ! yes ) {
			await trackEvent( 'command_confirm_cancel' );

			return {};
		}

		await trackEvent( 'command_confirm_success' );
	}

	if ( cb ) {
		res = await cb( this.sub, options );
		if ( _opts.format && res ) {
			if ( res.header ) {
				console.log( formatData( res.header, 'keyValue' ) );
				res = res.data;
			}

			res = res.map( row => {
				const out = Object.assign( {}, row );

				if ( out.__typename ) {
					// Apollo injects __typename
					delete out.__typename;
				}

				return out;
			} );

			await trackEvent( 'command_output', {
				format: options.format,
			} );

			const formattedOut = formatData( res, options.format );

			const p = pager();
			p.write( formattedOut + '\n' );
			p.end();
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
		wildcardCommand: false,
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

	// Add help and version to all subcommands
	a.option( 'help', 'Output the help for the (sub)command' );
	a.option( 'version', 'Output the version number' );

	return a;
}

export function getEnvIdentifier( env ) {
	let identifier = env.type;

	// If the env has a unique name (happens when site has multiple envs of a type), add on name
	// for disambiguation. Only on non-main-env
	if ( env.name !== env.type && env.name && env.appId !== env.id ) {
		identifier = `${ identifier }.${ env.name }`;
	}

	return identifier;
}
