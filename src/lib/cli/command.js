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
import { confirm } from './prompt';
import API from '../../lib/api';
import app from '../../lib/api/app';
import { formatData, formatSearchReplaceValues } from './format';
import pkg from '../../../package.json';
import { trackEvent } from '../../lib/tracker';
import { parseEnvAliasFromArgv } from './envAlias';
import * as exit from './exit';
import debugLib from 'debug';
import UserError from '../user-error';

function uncaughtError( err ) {
	// Error raised when trying to write to an already closed stream
	if ( err.code === 'EPIPE' ) {
		return;
	}
	if ( err instanceof UserError ) {
		exit.withError( err.message );
	}

	console.log( chalk.red( '✕' ), 'Please contact VIP Support with the following information:' );
	console.log( chalk.dim( err.stack ) );

	exit.withError( 'Unexpected error' );
}
process.on( 'uncaughtException', uncaughtError );
process.on( 'unhandledRejection', uncaughtError );

let _opts = {};

let alreadyConfirmedDebugAttachment = false;

// eslint-disable-next-line complexity
args.argv = async function ( argv, cb ) {
	if ( process.execArgv.includes( '--inspect' ) && ! alreadyConfirmedDebugAttachment ) {
		await prompt( {
			type: 'confirm',
			name: 'confirm',
			message: "\nAttach the debugger, once you see 'Debugger attached' above hit 'y' to continue",
		} );
		alreadyConfirmedDebugAttachment = true;
	}
	const parsedAlias = parseEnvAliasFromArgv( argv );

	// A usage option allows us to override the default usage text, which isn't
	// accurate for subcommands. By default, it will display something like (note
	// the hyphen):
	//   Usage: vip command-subcommand [options]
	//
	// We can pass "vip command subcommand" to the name param for more accurate
	// usage text:
	//   Usage: vip command subcommand [options]
	//
	// It also allows us to represent required args in usage text:
	//   Usage: vip command subcommand <arg1> <arg2> [options]
	const name = _opts.usage || null;

	const options = this.parse( parsedAlias.argv, {
		help: false,
		name,
		version: false,
		debug: false,
	} );

	if ( options.h || options.help ) {
		this.showHelp();
	}

	if ( options.v || options.version ) {
		this.showVersion();
	}

	if ( options.debug || options.d ) {
		debugLib.enable( options.debug === true ? '*' : options.debug );
	}

	// If we have both an --app/--env and an alias, we need to give a warning
	if ( parsedAlias.app && ( options.app || options.env ) ) {
		exit.withError(
			'Please only use an environment alias, or the --app and --env parameters, but not both'
		);
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
		exit.withError( error );
	}

	// If there's a sub-command, run that instead
	if ( this.isDefined( this.sub[ 0 ], 'commands' ) ) {
		return {};
	}

	// Check for updates every day
	updateNotifier( { pkg, isGlobal: true, updateCheckInterval: 1000 * 60 * 60 * 24 } ).notify();

	// `help` and `version` are always defined as subcommands
	const customCommands = this.details.commands.filter( command => {
		switch ( command.usage ) {
			case 'help':
			case 'version':
			case 'debug':
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
	if (
		! _opts.wildcardCommand &&
		this.sub[ _opts.requiredArgs ] &&
		0 > subCommands.indexOf( this.sub[ _opts.requiredArgs ] )
	) {
		const subcommand = this.sub.join( ' ' );

		await trackEvent( 'command_validation_error', {
			error: `Invalid subcommand: ${ subcommand }`,
		} );

		exit.withError( `\`${ subcommand }\` is not a valid subcommand. See \`vip --help\`` );
	}

	// Set the site in options.app
	let res;
	if ( _opts.appContext ) {
		// If --app is not set, try to infer the app context
		if ( ! options.app ) {
			const api = await API();

			await trackEvent( 'command_appcontext_list_fetch' );

			try {
				res = await api.query( {
					// $FlowFixMe: gql template is not supported by flow
					query: gql`query Apps( $first: Int, $after: String ) {
							apps( first: $first, after: $after ) {
								total
								nextCursor
								edges {
									${ _opts.appQuery }
								}
							}
						}
						${ _opts.appQueryFragments || '' }`,
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

				exit.withError( `Failed to get app (${ _opts.appQuery }) details: ${ message }` );
			}

			if (
				! res ||
				! res.data ||
				! res.data.apps ||
				! res.data.apps.edges ||
				! res.data.apps.edges.length
			) {
				await trackEvent( 'command_appcontext_list_fetch_error', {
					error: 'No apps found',
				} );

				exit.withError( "Couldn't find any apps" );
			}

			const appNames = res.data.apps.edges.map( cur => cur.name );

			let appSelection;
			try {
				appSelection = await prompt( {
					type: 'autocomplete',
					name: 'app',
					message: 'Which app?',
					limit: 10,
					choices: appNames,
				} );
			} catch ( err ) {
				if ( ! err ) {
					process.exit();
				}

				exit.withError( err.message || err );
			}

			// Copy all app information
			appSelection.app = res.data.apps.edges.find( cur => cur.name === appSelection.app );

			if ( ! appSelection || ! appSelection.app || ! appSelection.app.id ) {
				await trackEvent( 'command_appcontext_list_select_error', {
					error: 'Invalid app selected',
				} );

				exit.withError( `App ${ chalk.blueBright( appSelection.app.name ) } does not exist` );
			}

			await trackEvent( 'command_appcontext_list_select_success' );

			options.app = Object.assign( {}, appSelection.app );
		} else {
			let appLookup;
			try {
				appLookup = await app( options.app, _opts.appQuery, _opts.appQueryFragments );
			} catch ( err ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'App lookup failed',
				} );

				exit.withError( `App ${ chalk.blueBright( options.app ) } does not exist` );
			}

			if ( ! appLookup || ! appLookup.id ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'Invalid app specified',
				} );

				exit.withError( `App ${ chalk.blueBright( options.app ) } does not exist` );
			}

			await trackEvent( 'command_appcontext_param_select' );

			options.app = Object.assign( {}, appLookup );
		}

		if ( _opts.childEnvContext ) {
			options.app.environments = options.app.environments.filter(
				cur => cur.id !== options.app.id
			);
		}
	}

	if ( ( _opts.envContext || _opts.childEnvContext ) && options.app ) {
		if ( options.env ) {
			if ( _opts.childEnvContext && options.env.toLowerCase() === 'production' ) {
				await trackEvent( 'command_childcontext_param_error', {
					error: 'Cannot use `production`',
				} );

				exit.withError( 'Environment production is not allowed for this command' );
			}

			const env = options.app.environments.find( cur => getEnvIdentifier( cur ) === options.env );

			if ( ! env ) {
				await trackEvent( 'command_childcontext_param_error', {
					error: `Invalid child environment (${ options.env }) specified`,
				} );

				exit.withError(
					`Environment ${ chalk.blueBright( options.env ) } for app ${ chalk.blueBright(
						options.app.name
					) } does not exist`
				);
			}

			options.env = env;
		} else if ( ! options.app || ! options.app.environments || ! options.app.environments.length ) {
			console.log( 'To set up a new development environment, please contact VIP Support.' );

			await trackEvent( 'command_childcontext_fetch_error', {
				error: 'No child environments found',
			} );

			exit.withError(
				`Could not find any non-production environments for ${ chalk.blueBright(
					options.app.name
				) }.`
			);
		} else if ( options.app.environments.length === 1 ) {
			options.env = options.app.environments[ 0 ];
		} else if ( options.app.environments.length > 1 ) {
			const environmentNames = options.app.environments.map( envObject =>
				getEnvIdentifier( envObject )
			);

			let envSelection;
			try {
				envSelection = await prompt( {
					type: 'select',
					name: 'env',
					message: 'Which environment?',
					choices: environmentNames,
				} );
			} catch ( err ) {
				if ( ! err ) {
					process.exit();
				}

				exit.withError( err.message || err );
			}

			// Get full environment info after user selection
			envSelection.env = options.app.environments.find(
				envObject => getEnvIdentifier( envObject ) === envSelection.env
			);

			if ( ! envSelection || ! envSelection.env || ! envSelection.env.id ) {
				await trackEvent( 'command_childcontext_list_select_error', {
					error: 'Invalid environment selected',
				} );

				exit.withError(
					`Environment ${ chalk.blueBright( getEnvIdentifier( envSelection.env ) ) } does not exist`
				);
			}

			await trackEvent( 'command_childcontext_list_select_success' );

			options.env = envSelection.env;
		}
	}

	// Prompt for confirmation if necessary
	if ( _opts.requireConfirm && ! options.force ) {
		/** @type {Tuple[]} */
		const info = [];

		if ( options.app ) {
			info.push( { key: 'App', value: `${ options.app.name } (id: ${ options.app.id })` } );
		}

		if ( options.env ) {
			const envName = getEnvIdentifier( options.env );
			info.push( { key: 'Environment', value: `${ envName } (id: ${ options.env.id })` } );
		}

		let message = 'Are you sure?';
		if ( 'string' === typeof _opts.requireConfirm ) {
			message = _opts.requireConfirm;
		}

		switch ( _opts.module ) {
			case 'import-sql': {
				const site = options.env;
				if ( site && site.primaryDomain ) {
					const primaryDomainName = site.primaryDomain.name;
					info.push( { key: 'Primary Domain Name', value: primaryDomainName } );
				}

				// Site launched details
				const haveLaunchedField = Object.prototype.hasOwnProperty.call( site, 'launched' );

				if ( haveLaunchedField ) {
					const launched = site.launched ? '✅ Yes' : `${ chalk.red( 'x' ) } No`;

					info.push( { key: 'Launched?', value: `${ chalk.cyan( launched ) }` } );
				}

				if ( this.sub ) {
					info.push( { key: 'SQL File', value: `${ chalk.blueBright( this.sub ) }` } );
				}

				options.skipValidate =
					Object.prototype.hasOwnProperty.call( options, 'skipValidate' ) &&
					!! options.skipValidate &&
					! [ 'false', 'no' ].includes( options.skipValidate );

				if ( options.skipValidate ) {
					info.push( { key: 'Pre-Upload Validations', value: chalk.red( 'SKIPPED!' ) } );
				}

				// Show S-R params if the `search-replace` flag is set
				const searchReplace = options.searchReplace;

				const assignSRValues = ( from, to ) => {
					const pairs = {
						From: `${ from }`,
						To: `${ to }`,
					};

					return pairs;
				};

				if ( searchReplace ) {
					const searchReplaceValues = formatSearchReplaceValues( searchReplace, assignSRValues );

					// Format data into a user-friendly table
					info.push( {
						key: 'Replacements',
						value: '\n' + formatData( searchReplaceValues, 'table' ),
					} );
				}

				break;
			}

			case 'sync': {
				const { backup, canSync, errors } = options.env.syncPreview;

				if ( ! canSync ) {
					// User can not sync due to some error(s)
					// Shows the first error in the array
					exit.withError( `Could not sync to this environment: ${ errors[ 0 ].message }` );
				}

				// remove __typename from replacements.
				// can not be deleted afterwards if deconstructed
				const replacements = options.env.syncPreview.replacements.map( rep => {
					const { from, to } = rep;
					return { from, to };
				} );

				if ( backup ) {
					info.push( { key: 'From backup', value: new Date( backup.createdAt ).toUTCString() } );
				}
				info.push( { key: 'Replacements', value: '\n' + formatData( replacements, 'table' ) } );
				break;
			}

			case 'import-media':
				info.push( { key: 'Archive URL', value: chalk.blue.underline( this.sub ) } );

				options.overwriteExistingFiles =
					Object.prototype.hasOwnProperty.call( options, 'overwriteExistingFiles' ) &&
					!! options.overwriteExistingFiles &&
					! [ 'false', 'no' ].includes( options.overwriteExistingFiles );
				info.push( {
					key: 'Overwrite any existing files',
					value: options.overwriteExistingFiles ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );

				options.importIntermediateImages =
					Object.prototype.hasOwnProperty.call( options, 'importIntermediateImages' ) &&
					!! options.importIntermediateImages &&
					! [ 'false', 'no' ].includes( options.importIntermediateImages );
				info.push( {
					key: 'Import intermediate image files',
					value: options.importIntermediateImages ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );

				options.exportFileErrorsToJson =
					Object.prototype.hasOwnProperty.call( options, 'exportFileErrorsToJson' ) &&
					!! options.exportFileErrorsToJson &&
					! [ 'false', 'no' ].includes( options.exportFileErrorsToJson );
				info.push( {
					key: 'Export any file errors encountered to a JSON file instead of a plain text file',
					value: options.exportFileErrorsToJson ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );
				break;
			default:
		}

		const skipPrompt = _opts.skipConfirmPrompt || false;
		const yes = await confirm( info, message, skipPrompt );
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

			console.log( formattedOut );

			return {};
		}
	}

	return options;
};

/**
 * @returns {Error|undefined}
 */
function validateOpts( opts ) {
	if ( opts.app ) {
		if ( typeof opts.app !== 'string' && typeof opts.app !== 'number' ) {
			return new Error( 'Invalid --app' );
		}

		if ( opts.app.length < 1 ) {
			return new Error( 'Invalid --app' );
		}
	}

	if ( opts.env ) {
		if ( typeof opts.env !== 'string' && typeof opts.env !== 'number' ) {
			return new Error( 'Invalid --env' );
		}

		if ( opts.env.length < 1 ) {
			return new Error( 'Invalid --env' );
		}
	}
}

/**
 * @returns {args}
 */
export default function ( opts ) {
	_opts = Object.assign(
		{
			appContext: false,
			appQuery: 'id,name',
			childEnvContext: false,
			envContext: false,
			format: false,
			requireConfirm: false,
			requiredArgs: 0,
			wildcardCommand: false,
		},
		opts
	);

	if ( _opts.appContext || _opts.requireConfirm ) {
		args.option( 'app', 'Specify the app' );
	}

	if ( _opts.envContext || _opts.childEnvContext ) {
		args.option( 'env', 'Specify the environment' );
	}

	if ( _opts.requireConfirm ) {
		args.option( 'force', 'Skip confirmation', false );
	}

	if ( _opts.format ) {
		args.option( 'format', 'Format results', 'table' );
	}

	// Add help and version to all subcommands
	args.option( 'help', 'Output the help for the (sub)command' );
	args.option( 'version', 'Output the version number' );
	args.option( 'debug', 'Activate debug output' );

	return args;
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

export function containsAppEnvArgument( argv ) {
	const parsedAlias = parseEnvAliasFromArgv( argv );

	return !! (
		parsedAlias.app ||
		parsedAlias.env ||
		argv.includes( '--app' ) ||
		argv.includes( '--env' )
	);
}
