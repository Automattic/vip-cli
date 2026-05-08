import chalk from 'chalk';
import { Command } from 'commander';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { isAlias, parseEnvAliasFromArgv } from './envAlias';
import * as exit from './exit';
import { formatData, formatSearchReplaceValues } from './format';
import { hasInternalBin, loadInternalBin } from './internal-bin-loader';
import { confirm } from './prompt';
import pkg from '../../../package.json';
import API from '../../lib/api';
import app from '../../lib/api/app';
import { trackEvent } from '../../lib/tracker';
import { parseApiError } from '../../lib/utils';
import UserError from '../user-error';

function uncaughtError( err ) {
	// Error raised when trying to write to an already closed stream
	if ( err.code === 'EPIPE' ) {
		return;
	}
	if ( err instanceof UserError ) {
		exit.withError( err );
	}

	console.log( chalk.red( '✕' ), 'Please contact VIP Support with the following information:' );
	console.log( chalk.dim( err.stack ) );

	exit.withError( 'Unexpected error' );
}
process.on( 'uncaughtException', uncaughtError );
process.on( 'unhandledRejection', uncaughtError );

let _opts = {};

let alreadyConfirmedDebugAttachment = false;
const RESERVED_AUTO_SHORT_ALIASES = new Set( [ 'h', 'v', 'd' ] );

function normalizeUsage( program, usage ) {
	if ( ! usage ) {
		return;
	}

	const [ rootCommand, ...rest ] = usage.trim().split( /\s+/ );
	if ( rootCommand ) {
		program.name( rootCommand );
	}

	if ( rest.length ) {
		const usageString = rest.join( ' ' );
		program.usage(
			usageString.includes( '[options]' ) ? usageString : `${ usageString } [options]`
		);
	}
}

function createOptionDefinition( name, description, defaultValue, parseFn, usedShortNames ) {
	const isArray = Array.isArray( name );
	const shortName = isArray ? name[ 0 ] : null;
	const longName = isArray ? name[ 1 ] : name;
	const normalizedLongName = String( longName ).trim().replace( /^--?/, '' );
	const explicitShortName = shortName ? String( shortName ).trim().replace( /^-/, '' ) : null;
	let normalizedShortName = explicitShortName;

	if ( ! normalizedShortName ) {
		const autoShortName = normalizedLongName.charAt( 0 );
		const canUseAutoShortName =
			autoShortName &&
			! RESERVED_AUTO_SHORT_ALIASES.has( autoShortName ) &&
			! usedShortNames.has( autoShortName );

		if ( canUseAutoShortName ) {
			normalizedShortName = autoShortName;
		}
	}

	if ( normalizedShortName ) {
		usedShortNames.add( normalizedShortName );
	}
	const isBooleanOption = typeof defaultValue === 'boolean';
	const usesOptionalValue = ! isBooleanOption;
	const parseOptionValue = value => {
		if ( parseFn ) {
			return parseFn( value );
		}

		return value;
	};

	let parser;
	if ( usesOptionalValue ) {
		parser = ( value, previousValue ) => {
			const parsedValue = parseOptionValue( value );
			if ( previousValue === undefined ) {
				return parsedValue;
			}

			if ( Array.isArray( previousValue ) ) {
				return [ ...previousValue, parsedValue ];
			}

			return [ previousValue, parsedValue ];
		};
	}

	let flags = `--${ normalizedLongName }`;
	if ( usesOptionalValue ) {
		flags += ' [value]';
	}

	if ( normalizedShortName ) {
		flags = `-${ normalizedShortName }, ${ flags }`;
	}

	return {
		flags,
		description,
		defaultValue,
		parser,
	};
}

function isOptionToken( arg ) {
	return arg !== '-' && arg.startsWith( '-' );
}

class CommanderArgsCompat {
	constructor( opts ) {
		this.details = {
			commands: [],
		};
		this.sub = [];
		this.examplesList = [];
		this.usedShortNames = new Set();
		this._opts = opts;
		this.program = new Command();
		this.program.allowUnknownOption( true );
		this.program.allowExcessArguments( true );
		this.program.helpOption( false );
		normalizeUsage( this.program, this._opts.usage );
	}

	option( name, description, defaultValue, parseFn ) {
		const definition = createOptionDefinition(
			name,
			description,
			defaultValue,
			parseFn,
			this.usedShortNames
		);
		const { flags, parser } = definition;

		if ( parser && defaultValue !== undefined ) {
			this.program.option( flags, description, parser, defaultValue );
		} else if ( parser ) {
			this.program.option( flags, description, parser );
		} else if ( defaultValue !== undefined ) {
			this.program.option( flags, description, defaultValue );
		} else {
			this.program.option( flags, description );
		}

		return this;
	}

	command( name, description = '' ) {
		this.details.commands.push( {
			usage: name,
			description,
		} );

		return this;
	}

	example( usage, description ) {
		this.examplesList.push( {
			usage,
			description,
		} );

		return this;
	}

	examples( examples = [] ) {
		for ( const example of examples ) {
			this.example( example.usage, example.description );
		}

		return this;
	}

	showVersion() {
		console.log( pkg.version );
		process.exit( 0 );
	}

	showHelp() {
		const lines = [ this.program.helpInformation().trimEnd() ];

		if ( this.details.commands.length ) {
			lines.push( '' );
			lines.push( 'Commands:' );
			for ( const entry of this.details.commands ) {
				const commandName = entry.usage.padEnd( 26, ' ' );
				lines.push( `  ${ commandName }${ entry.description }` );
			}
		}

		if ( this.examplesList.length ) {
			lines.push( '' );
			lines.push( 'Examples:' );
			for ( const example of this.examplesList ) {
				lines.push( `  - ${ example.description }` );
				lines.push( `    $ ${ example.usage }` );
			}
		}

		console.log( lines.join( '\n' ) );
		process.exit( 0 );
	}

	isDefined( value, key ) {
		if ( key !== 'commands' ) {
			return false;
		}

		return this.details.commands.some( entry => entry.usage === value );
	}

	parse( argv ) {
		this.program.parse( argv, { from: 'node' } );
		this.sub = this.program.args.slice();
		return this.program.opts();
	}

	findSubcommand( argv ) {
		const dashDashIndex = argv.indexOf( '--', 2 );
		const searchEnd = dashDashIndex === -1 ? argv.length : dashDashIndex;

		for ( let index = 2; index < searchEnd; index++ ) {
			const arg = argv[ index ];
			if ( this.isDefined( arg, 'commands' ) ) {
				return { index, name: arg };
			}

			if ( ! isOptionToken( arg ) ) {
				return null;
			}

			const nextArg = argv[ index + 1 ];
			const optionHasInlineValue = arg.includes( '=' );
			const nextArgCouldBeOptionValue =
				nextArg && ! isOptionToken( nextArg ) && ! this.isDefined( nextArg, 'commands' );

			if ( ! optionHasInlineValue && nextArgCouldBeOptionValue ) {
				index++;
			}
		}

		return null;
	}

	async executeSubcommand( argv, parsedAlias, subcommand ) {
		const currentScript = argv[ 1 ];
		const subcommandName = subcommand.name;
		const extension = path.extname( currentScript );
		const baseScriptPath = extension ? currentScript.slice( 0, -extension.length ) : currentScript;
		const childScriptPath = extension
			? `${ baseScriptPath }-${ subcommandName }${ extension }`
			: `${ baseScriptPath }-${ subcommandName }`;
		const aliasFromRawArgv = argv.slice( 2 ).find( arg => isAlias( arg ) );
		let childArgs = [
			...parsedAlias.argv.slice( 2, subcommand.index ),
			...parsedAlias.argv.slice( subcommand.index + 1 ),
		];

		if ( aliasFromRawArgv ) {
			childArgs = [ aliasFromRawArgv, ...childArgs ];
		}

		let runResult;
		if ( fs.existsSync( childScriptPath ) ) {
			runResult = spawnSync( process.execPath, [ childScriptPath, ...childArgs ], {
				stdio: 'inherit',
				env: process.env,
			} );
		} else {
			const fallbackCommand = `${ path.basename( baseScriptPath ) }-${ subcommandName }`;

			if ( process.env.VIP_CLI_SEA_MODE === '1' && hasInternalBin( fallbackCommand ) ) {
				process.argv = [ process.argv[ 0 ], process.argv[ 1 ], ...childArgs ];
				const loaded = await loadInternalBin( fallbackCommand );
				if ( ! loaded ) {
					throw new Error( `Unable to load SEA subcommand "${ fallbackCommand }"` );
				}

				return;
			}

			runResult = spawnSync( fallbackCommand, childArgs, {
				stdio: 'inherit',
				env: process.env,
				shell: process.platform === 'win32',
			} );
		}

		if ( runResult.error ) {
			throw runResult.error;
		}

		process.exit( runResult.status ?? 1 );
	}
}

/**
 * @param {string[]} argv
 */
// eslint-disable-next-line complexity
CommanderArgsCompat.prototype.argv = async function ( argv, cb ) {
	if ( process.execArgv.includes( '--inspect' ) && ! alreadyConfirmedDebugAttachment ) {
		await prompt( {
			type: 'confirm',
			name: 'confirm',
			message: "\nAttach the debugger, once you see 'Debugger attached' above hit 'y' to continue",
		} );
		alreadyConfirmedDebugAttachment = true;
	}
	const parsedAlias = parseEnvAliasFromArgv( argv );

	const options = this.parse( parsedAlias.argv );

	// If there's a sub-command, run that instead
	const dispatchSubcommand = this.findSubcommand( parsedAlias.argv );
	if ( dispatchSubcommand ) {
		await this.executeSubcommand( argv, parsedAlias, dispatchSubcommand );
		return {};
	}

	if ( _opts.format && ! options.format ) {
		options.format = 'table';
	}

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

	if ( process.env.NODE_ENV !== 'test' && process.env.VIP_CLI_SEA_MODE !== '1' ) {
		const { default: updateNotifier } = await import( 'update-notifier' );
		updateNotifier( { pkg, updateCheckInterval: 1000 * 60 * 60 * 24 } ).notify( {
			isGlobal: true,
		} );
	}

	const customCommands = this.details.commands;

	// Show help if no args passed
	if ( Boolean( customCommands.length ) && ! this.sub.length ) {
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
		subCommands.length &&
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
			const api = API();

			await trackEvent( 'command_appcontext_list_fetch' );

			try {
				res = await api.query( {
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

			if ( ! res.data?.apps?.edges?.length ) {
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

			if ( ! appSelection.app?.id ) {
				await trackEvent( 'command_appcontext_list_select_error', {
					error: 'Invalid app selected',
				} );

				exit.withError( `App ${ chalk.blueBright( appSelection.app.name ) } could not be located` );
			}

			await trackEvent( 'command_appcontext_list_select_success' );

			options.app = { ...appSelection.app };
		} else {
			let appLookup;
			try {
				appLookup = await app( options.app, _opts.appQuery, _opts.appQueryFragments );
			} catch ( err ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'App lookup failed',
				} );

				// Get error message, if available.
				const apiErrorMsg = parseApiError( err );

				let errorMsg = `Unable to find app ${ chalk.blueBright( options.app ) }: `;

				if ( apiErrorMsg ) {
					errorMsg += apiErrorMsg;
				} else {
					// Should happen rarely, if ever. Let's include stack trace for debugging.
					errorMsg += 'Unknown error. If this persists, please contact VIP support.\n' + err.stack;
				}

				exit.withError( errorMsg );
			}

			if ( ! appLookup?.id ) {
				await trackEvent( 'command_appcontext_param_error', {
					error: 'Invalid app specified',
				} );

				exit.withError( `App ${ chalk.blueBright( options.app ) } does not exist` );
			}

			await trackEvent( 'command_appcontext_param_select' );

			options.app = { ...appLookup };
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

			const env = options.app.environments.find(
				cur => getEnvIdentifier( cur ).toLowerCase() === options.env.toLowerCase()
			);

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
		} else if ( ! options.app?.environments?.length ) {
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

			if ( ! envSelection.env?.id ) {
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

	// Negotiate flag values
	if ( _opts.module === 'import-media' ) {
		if ( [ true, 'true', 'yes' ].includes( options.saveErrorLog ) ) {
			options.saveErrorLog = 'true';
		} else if ( [ false, 'false', 'no' ].includes( options.saveErrorLog ) ) {
			options.saveErrorLog = 'false';
		} else {
			options.saveErrorLog = 'prompt';
		}
	}

	// Prompt for confirmation if necessary
	if ( _opts.requireConfirm && ! options.force ) {
		/** @type {import('./format').Tuple[]} */
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
				if ( site?.primaryDomain ) {
					const primaryDomainName = site.primaryDomain.name;
					info.push( { key: 'Primary Domain Name', value: primaryDomainName } );
				}

				// Site launched details
				const haveLaunchedField = Object.hasOwn( site, 'launched' );

				if ( haveLaunchedField ) {
					const launched = site.launched ? '✅ Yes' : `${ chalk.red( 'x' ) } No`;

					info.push( { key: 'Launched?', value: `${ chalk.cyan( launched ) }` } );
				}

				if ( this.sub.length ) {
					info.push( { key: 'SQL File', value: `${ chalk.blueBright( this.sub ) }` } );
				}

				options.skipValidate =
					Object.hasOwn( options, 'skipValidate' ) &&
					Boolean( options.skipValidate ) &&
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

			case 'import-media': {
				const isUrl =
					this.sub.length &&
					( String( this.sub ).startsWith( 'http://' ) ||
						String( this.sub ).startsWith( 'https://' ) );
				const archiveLabel = isUrl ? 'Archive URL' : 'Archive Path';
				info.push( { key: archiveLabel, value: chalk.blue.underline( this.sub ) } );

				// Update confirmation message if it's a local path
				if ( ! isUrl && 'string' === typeof _opts.requireConfirm ) {
					message = message.replaceAll( 'the URL', 'the path' );
				}

				options.overwriteExistingFiles =
					Object.hasOwn( options, 'overwriteExistingFiles' ) &&
					Boolean( options.overwriteExistingFiles ) &&
					! [ 'false', 'no' ].includes( options.overwriteExistingFiles );
				info.push( {
					key: 'Overwrite any existing files',
					value: options.overwriteExistingFiles ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );

				options.importIntermediateImages =
					Object.hasOwn( options, 'importIntermediateImages' ) &&
					Boolean( options.importIntermediateImages ) &&
					! [ 'false', 'no' ].includes( options.importIntermediateImages );
				info.push( {
					key: 'Import intermediate image files',
					value: options.importIntermediateImages ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );

				options.exportFileErrorsToJson =
					Object.hasOwn( options, 'exportFileErrorsToJson' ) &&
					Boolean( options.exportFileErrorsToJson ) &&
					! [ 'false', 'no' ].includes( options.exportFileErrorsToJson );
				info.push( {
					key: 'Export any file errors encountered to a JSON file instead of a plain text file.',
					value: options.exportFileErrorsToJson ? '✅ Yes' : `${ chalk.red( 'x' ) } No`,
				} );

				info.push( {
					key: 'Download file-error logs?',
					value: options.saveErrorLog,
				} );
				break;
			}
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
				if ( options.format !== 'json' ) {
					console.log( formatData( res.header, 'keyValue' ) );
				}
				res = res.data;
			}

			res = res.map( row => {
				const out = { ...row };

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
 * @returns {CommanderArgsCompat}
 */
export default function ( opts ) {
	_opts = {
		appContext: false,
		appQuery: 'id,name',
		childEnvContext: false,
		envContext: false,
		format: false,
		requireConfirm: false,
		requiredArgs: 0,
		wildcardCommand: false,
		...opts,
	};

	const args = new CommanderArgsCompat( _opts );

	if ( _opts.appContext || _opts.requireConfirm ) {
		args.option(
			'app',
			'Target an application. Accepts a string value for the application name or an integer for the application ID.'
		);
	}

	if ( _opts.envContext || _opts.childEnvContext ) {
		args.option( 'env', 'Target an environment. Accepts a string value for the environment type.' );
	}

	if ( _opts.requireConfirm ) {
		args.option( 'force', 'Skip confirmation.', false );
	}

	if ( _opts.format ) {
		args.option(
			'format',
			'Render output in a particular format. Accepts “table“ (default), “csv“, and “json“.'
		);
	}

	// Add help and version to all subcommands
	args.option(
		[ 'h', 'help' ],
		'Retrieve a description, examples, and available options for a (sub)command.',
		false
	);
	args.option(
		[ 'v', 'version' ],
		'Retrieve the version number of VIP-CLI currently installed on the local machine.',
		false
	);
	args.option(
		[ 'd', 'debug' ],
		'Generate verbose output during command execution to help identify or fix errors or bugs.'
	);

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

	return Boolean(
		parsedAlias.app || parsedAlias.env || argv.includes( '--app' ) || argv.includes( '--env' )
	);
}
