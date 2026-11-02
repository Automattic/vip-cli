import chalk from 'chalk';
import { Command } from 'commander';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { isAlias, parseEnvAliasFromArgv } from './envAlias';
import * as exit from './exit';
import { formatData, formatSearchReplaceValues } from './format';
import { confirm } from './prompt';
import pkg from '../../../package.json';
import API from '../../lib/api';
import app from '../../lib/api/app';
import { trackEvent } from '../../lib/tracker';
import { parseApiError } from '../../lib/utils';
import UserError from '../user-error';

const secretFragments = [
	'password',
	'passwd',
	'passphrase',
	'secret',
	'token',
	'credential',
	'authorization',
	'cookie',
	'privatekey',
	'apikey',
	'signature',
];

/**
 * Determines if a given property key is considered secret.
 * Secret properties are typically sensitive information like passwords, tokens, and API keys.
 *
 * @param {string|symbol} key - The property key to check.
 * @returns {boolean} True if the property is considered secret, false otherwise.
 */
function isSecretProperty( key ) {
	const normalized = String( key )
		.replace( /[^a-z0-9]/gi, '' )
		.toLowerCase();
	return (
		normalized === 'key' || secretFragments.some( fragment => normalized.includes( fragment ) )
	);
}

/**
 * Redacts sensitive information from a diagnostic text value.
 *
 * @param {string} value - The diagnostic text to redact.
 * @returns {string} The redacted diagnostic text.
 */
function redactDiagnosticText( value ) {
	return value
		.replace( /\b((?:https?|wss?|socks[45]h?|ftp):\/\/)[^/?#\s]+@/gi, '$1[REDACTED]@' )
		.replace( /([?&])([^?=&\s]+)=([^?&#\s]*)/g, ( match, separator, key ) => {
			try {
				return isSecretProperty( decodeURIComponent( key ) )
					? `${ separator }${ key }=[REDACTED]`
					: match;
			} catch {
				return `${ separator }[REDACTED]`;
			}
		} )
		.replace( /\b(Bearer|Basic)\s+\S+/gi, '$1 [REDACTED]' );
}

/**
 * Reads a property from a diagnostic value safely.
 * Returns '[Unreadable property]' if the property cannot be accessed.
 *
 * @param {Record<string, unknown>|Error|null|undefined} value - The diagnostic value to read from.
 * @param {string} key - The property key to read.
 * @returns {unknown} The property value or '[Unreadable property]' if inaccessible.
 */
function readDiagnosticProperty( value, key ) {
	try {
		return /** @type {Record<string, unknown>|null|undefined} */ ( value )?.[ key ];
	} catch {
		return '[Unreadable property]';
	}
}

/**
 * Creates a shallow copy of a diagnostic value, redacting sensitive information.
 *
 * @param {unknown} value - The diagnostic value to copy.
 * @returns {unknown} The copied diagnostic value with sensitive information redacted.
 */
function createDiagnosticCopy( value ) {
	if ( ! ( value instanceof Error ) ) {
		if ( Array.isArray( value ) ) {
			return [];
		}

		return Object.create( Object.getPrototypeOf( value ) === null ? null : Object.prototype );
	}

	const copy = new Error(); // NOSONAR
	copy.stack = undefined;
	for ( const key of [ 'message', 'stack', 'name' ] ) {
		const text = readDiagnosticProperty( value, key );
		if ( typeof text === 'string' && ( key !== 'name' || text !== 'Error' ) ) {
			Object.defineProperty( copy, key, {
				value: redactDiagnosticText( text ),
				configurable: true,
			} );
		}
	}

	return copy;
}

/**
 * Copies diagnostic properties from a value to its shallow copy, redacting sensitive information.
 *
 * @param {object} value - The original diagnostic value.
 * @param {unknown} copy - The shallow copy of the diagnostic value.
 * @param {WeakMap<object, unknown>} seen - A WeakMap tracking already seen objects to handle circular references.
 * @param {number} depth - The current depth of the recursive sanitization.
 * @returns {void} This function does not return a value.
 */
function copyDiagnosticProperties( value, copy, seen, depth ) {
	const isError = value instanceof Error;
	for ( const key of Reflect.ownKeys( value ) ) {
		if (
			key === util.inspect.custom ||
			( isError && [ 'message', 'stack', 'name' ].includes( /** @type {string} */ ( key ) ) ) ||
			( Array.isArray( copy ) && key === 'length' )
		) {
			continue;
		}

		const descriptor = Object.getOwnPropertyDescriptor( value, key );
		const secret =
			isSecretProperty( key ) ||
			( typeof key === 'string' && /^(?:body|bodyText|requestBody|responseBody)$/i.test( key ) ) ||
			( isError &&
				key === 'input' &&
				readDiagnosticProperty( value, 'code' ) === 'ERR_INVALID_URL' );

		/** @type {unknown} */
		let propertyValue = '[Accessor]';
		if ( secret ) {
			propertyValue = '[REDACTED]';
		} else if ( descriptor && 'value' in descriptor ) {
			propertyValue = sanitizeDiagnostic( descriptor.value, seen, depth + 1 );
		}

		Object.defineProperty( copy, key, {
			value: propertyValue,
			enumerable: descriptor?.enumerable ?? true,
			configurable: true,
		} );
	}
}

/**
 * Copy own diagnostic data before inspection so nested secrets are redacted and
 * accessors and custom inspectors cannot run while the snapshot is rendered.
 *
 * @param {unknown} value - The diagnostic value to sanitize.
 * @param {WeakMap<object, unknown>} [seen] - A WeakMap tracking already seen objects to handle circular references.
 * @param {number} [depth] - The current depth of the recursive sanitization.
 * @returns {unknown} The sanitized diagnostic value.
 */
function sanitizeDiagnostic( value, seen = new WeakMap(), depth = 0 ) {
	try {
		if ( typeof value === 'string' || typeof value === 'symbol' ) {
			return redactDiagnosticText( String( value ) );
		}

		if ( typeof value === 'function' ) {
			return '[Function]';
		}

		if ( value === null || typeof value !== 'object' ) {
			return value;
		}

		if ( seen.has( value ) ) {
			return seen.get( value );
		}

		if ( depth > 5 ) {
			return '[Object]';
		}

		const copy = createDiagnosticCopy( value );
		seen.set( value, copy );
		copyDiagnosticProperties( value, copy, seen, depth );
		return copy;
	} catch {
		return '[Uninspectable value]';
	}
}

/**
 * Renders any thrown value as a single line without throwing.
 *
 * `String()` prints plain objects as "[object Object]" and throws for objects
 * without a prototype, so objects are inspected instead.
 *
 * @param {unknown} value The value to render.
 * @returns {string} A one-line description of the value.
 */
function describeValue( value ) {
	try {
		const safeValue = sanitizeDiagnostic( value );
		return typeof safeValue === 'object' && safeValue !== null
			? util.inspect( safeValue, {
					depth: 0,
					breakLength: Infinity,
					showHidden: true,
					customInspect: false,
			  } )
			: String( safeValue );
	} catch {
		return '[Uninspectable value]';
	}
}

/**
 * Inspects sanitized diagnostic data, returning a placeholder on failure.
 *
 * @param {unknown} value The value to inspect.
 * @returns {string} The inspected string.
 */
function inspect( value ) {
	try {
		return util.inspect( sanitizeDiagnostic( value ), {
			depth: 5,
			showHidden: true,
			customInspect: false,
		} );
	} catch {
		return '[Uninspectable value]';
	}
}

/**
 * Builds a human-readable, multi-line description of a fatal error for display.
 *
 * Bare native rejections (e.g. keytar's "An unknown error occurred.") arrive as
 * Errors whose stack is only the message line, so the usual stack print reveals
 * nothing. In those cases — and whenever the error carries extra own properties
 * that would otherwise be lost — we append a sanitized `util.inspect` dump so
 * diagnostic properties survive without printing credentials.
 *
 * @param {unknown} err The thrown value.
 * @returns {string} The formatted details to print.
 */
export function formatFatalError( err ) {
	err = sanitizeDiagnostic( err );
	if ( ! ( err instanceof Error ) ) {
		// Plain objects would stringify to "[object Object]"; inspect them instead.
		return typeof err === 'object' && err !== null ? inspect( err ) : String( err );
	}

	const lines = [];

	if ( err.stack ) {
		lines.push( err.stack );
	} else {
		lines.push( err.message );
	}

	if ( err.code !== undefined ) {
		lines.push( `Code: ${ describeValue( err.code ) }` );
	}

	if ( err.cause !== undefined ) {
		lines.push( `Cause: ${ inspect( err.cause ) }` );
	}

	// A stack with no frames beyond the message line tells us nothing, and extra
	// own properties would be dropped by the stack/message print above. In either
	// case, dump the sanitized object to preserve diagnostic properties.
	const stackHasFrames = Boolean( err.stack ) && /\n[ \t]+at\s/.test( err.stack );
	const hasExtraOwnProps = Object.getOwnPropertyNames( err ).some(
		prop => ! [ 'message', 'stack', 'name' ].includes( prop )
	);

	if ( ! stackHasFrames || hasExtraOwnProps ) {
		lines.push( inspect( err ) );
	}

	return lines.join( '\n' );
}

/**
 * Last-resort handler for uncaught exceptions and unhandled rejections.
 *
 * @param {unknown} err The thrown value, which need not be an Error.
 */
export function uncaughtError( err ) {
	// Error raised when trying to write to an already closed stream
	if ( readDiagnosticProperty( err, 'code' ) === 'EPIPE' ) {
		return;
	}
	if ( err instanceof UserError ) {
		exit.withError( err );
	}

	console.log( chalk.red( '✕' ), 'Please contact VIP Support with the following information:' );
	console.log( chalk.dim( formatFatalError( err ) ) );
	console.log(
		chalk.dim(
			'Hint: re-run with the environment variable DEBUG=@automattic/vip:* to print verbose logs, even when the failure happens before argument parsing.'
		)
	);

	const message = describeValue(
		err instanceof Error ? readDiagnosticProperty( err, 'message' ) : err
	);
	exit.withError( `Unexpected error: ${ message }` );
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
		normalizedShortName,
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
		this.shortOptionsExpectingValue = new Set();
		this.longOptionsExpectingValue = new Set();
		this.knownShortOptions = new Set();
		this.knownLongOptions = new Set();
		this._opts = opts;
		this.program = new Command();
		this.program.allowUnknownOption( true );
		this.program.allowExcessArguments( true );
		this.program.helpOption( false );
		normalizeUsage( this.program, this._opts.usage );
		this.optionDefaults = new Map();
	}

	option( name, description, defaultValue, parseFn ) {
		const definition = createOptionDefinition(
			name,
			description,
			defaultValue,
			parseFn,
			this.usedShortNames
		);
		const { flags, parser, normalizedShortName } = definition;
		const normalizedLongName = String( Array.isArray( name ) ? name[ 1 ] : name )
			.trim()
			.replace( /^--?/, '' );
		const isValueOption = typeof defaultValue !== 'boolean';
		this.knownLongOptions.add( normalizedLongName );

		if ( normalizedShortName ) {
			this.knownShortOptions.add( normalizedShortName );
		}

		if ( isValueOption && normalizedShortName ) {
			this.shortOptionsExpectingValue.add( normalizedShortName );
		}

		if ( isValueOption ) {
			this.longOptionsExpectingValue.add( normalizedLongName );
		}

		// When there's a parser, track the default separately and don't pass it to Commander.
		// This prevents the parser from incorrectly accumulating the default value with the first explicit value.
		if ( parser && defaultValue !== undefined ) {
			this.optionDefaults.set( normalizedLongName, defaultValue );
			this.program.option( flags, description, parser );
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
		this.program.parse( this.normalizeShortOptionEqualsSyntax( argv ), { from: 'node' } );
		this.sub = this.program.args.slice();
		const opts = this.program.opts();

		// Apply tracked defaults for options with parsers
		for ( const [ optionName, defaultValue ] of this.optionDefaults ) {
			if ( opts[ optionName ] === undefined ) {
				opts[ optionName ] = defaultValue;
			}
		}

		return opts;
	}

	normalizeShortOptionEqualsSyntax( argv ) {
		const normalizedArgv = argv.slice( 0, 2 );

		for ( const arg of argv.slice( 2 ) ) {
			const shortOptionEqualsMatch = /^-([A-Za-z0-9])=(.*)$/.exec( arg );
			if ( ! shortOptionEqualsMatch ) {
				normalizedArgv.push( arg );
				continue;
			}

			const shortOptionName = shortOptionEqualsMatch[ 1 ];
			const optionValue = shortOptionEqualsMatch[ 2 ];

			if ( ! this.shortOptionsExpectingValue.has( shortOptionName ) ) {
				normalizedArgv.push( arg );
				continue;
			}

			normalizedArgv.push( `-${ shortOptionName }`, optionValue );
		}

		return normalizedArgv;
	}

	findSubcommand( argv ) {
		const searchStart = argv[ 2 ] === '--' ? 3 : 2;
		const dashDashIndex = argv.indexOf( '--', searchStart );
		const searchEnd = dashDashIndex === -1 ? argv.length : dashDashIndex;

		for ( let index = searchStart; index < searchEnd; index++ ) {
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

		if ( dashDashIndex > -1 && this.isDefined( argv[ dashDashIndex + 1 ], 'commands' ) ) {
			return { index: dashDashIndex + 1, name: argv[ dashDashIndex + 1 ] };
		}

		return null;
	}

	findUnknownOption( argv ) {
		const dashDashIndex = argv.indexOf( '--', 2 );
		const searchEnd = dashDashIndex === -1 ? argv.length : dashDashIndex;

		for ( let index = 2; index < searchEnd; index++ ) {
			const arg = argv[ index ];
			if ( ! isOptionToken( arg ) ) {
				continue;
			}

			if ( arg.startsWith( '--' ) ) {
				const [ tokenName ] = arg.slice( 2 ).split( '=' );
				if ( ! this.knownLongOptions.has( tokenName ) ) {
					return tokenName;
				}

				const hasInlineValue = arg.includes( '=' );
				const nextArg = argv[ index + 1 ];
				if (
					this.longOptionsExpectingValue.has( tokenName ) &&
					! hasInlineValue &&
					nextArg &&
					! isOptionToken( nextArg )
				) {
					index++;
				}

				continue;
			}

			const shortEqualsMatch = /^-([A-Za-z0-9])=(.*)$/.exec( arg );
			if ( shortEqualsMatch ) {
				const shortName = shortEqualsMatch[ 1 ];
				if ( ! this.knownShortOptions.has( shortName ) ) {
					return shortName;
				}

				continue;
			}

			const shortMatch = /^-([A-Za-z0-9])$/.exec( arg );
			if ( shortMatch ) {
				const shortName = shortMatch[ 1 ];
				if ( ! this.knownShortOptions.has( shortName ) ) {
					return shortName;
				}

				const nextArg = argv[ index + 1 ];
				if (
					this.shortOptionsExpectingValue.has( shortName ) &&
					nextArg &&
					! isOptionToken( nextArg )
				) {
					index++;
				}

				continue;
			}

			return arg.replace( /^-+/, '' );
		}

		return null;
	}

	hasWpCommandPayload( subcommandArgs ) {
		const wpFlagsWithoutValue = new Set( [ '--help', '-h', '--version', '-v', '--yes', '-y' ] );
		let expectOptionValue = false;

		for ( const arg of subcommandArgs ) {
			if ( expectOptionValue ) {
				if ( ! isOptionToken( arg ) ) {
					expectOptionValue = false;
					continue;
				}

				expectOptionValue = false;
			}

			if ( ! isOptionToken( arg ) ) {
				return true;
			}

			if ( arg.startsWith( '--' ) ) {
				if ( arg.includes( '=' ) || wpFlagsWithoutValue.has( arg ) ) {
					continue;
				}

				expectOptionValue = true;
				continue;
			}

			if ( /^-[A-Za-z0-9]$/.test( arg ) ) {
				if ( wpFlagsWithoutValue.has( arg ) ) {
					continue;
				}

				expectOptionValue = true;
				continue;
			}

			if ( /^-[A-Za-z0-9]+=/.test( arg ) ) {
				continue;
			}

			return true;
		}

		return false;
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
		const rawArgsBeforeSubcommand = parsedAlias.argv.slice( 2, subcommand.index );
		const hasSeparatorBeforeSubcommand = rawArgsBeforeSubcommand.includes( '--' );
		const argsBeforeSubcommand = rawArgsBeforeSubcommand.filter( arg => arg !== '--' );
		const subcommandArgs = parsedAlias.argv.slice( subcommand.index + 1 );
		const hasWpCommandPayload = this.hasWpCommandPayload( subcommandArgs );
		const hasSeparator = argv.includes( '--' );
		if ( subcommandName === 'wp' && hasWpCommandPayload && ! hasSeparator ) {
			exit.withError(
				'A double dash ("--") must separate the arguments of "vip" from those of "wp". Run "vip wp --help" for examples.'
			);
		}

		let childArgs = [
			...argsBeforeSubcommand,
			...( hasSeparatorBeforeSubcommand ? [ '--' ] : [] ),
			...subcommandArgs,
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

	if ( ! _opts.wildcardCommand ) {
		const unknownOption = this.findUnknownOption( parsedAlias.argv );
		if ( unknownOption ) {
			await trackEvent( 'command_validation_error', {
				error: `Unknown option: ${ unknownOption }`,
			} );

			exit.withError(
				`The option "${ unknownOption }" is unknown. Did you mean the following one?\n-h, --help  Retrieve a description, examples, and available options for a (sub)command.`
			);
		}
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

	if ( process.env.NODE_ENV !== 'test' ) {
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
