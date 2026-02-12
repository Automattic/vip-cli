import { Command } from 'commander';
import debugLib from 'debug';

import { parseEnvAliasFromArgv } from './envAlias';
import * as exit from './exit';
import { formatData } from './format';
import pkg from '../../../package.json';

import type { OutputFormat, Tuple } from './format';

interface Example {
	usage: string;
	description: string;
}

interface CommandOptions {
	usage?: string;
	requiredArgs?: number;
	wildcardCommand?: boolean;
	format?: boolean;
}

type CommandResult =
	| {
			header?: Tuple[];
			data?: Record< string, unknown >[];
	  }
	| Record< string, unknown >[]
	| undefined;

type CommandCallback = ( subArgs: string[], options: Record< string, unknown > ) => unknown;

function normalizeUsage( program: Command, usage?: string ) {
	if ( ! usage ) {
		return;
	}

	const [ rootCommand, ...rest ] = usage.trim().split( /\s+/ );
	if ( rootCommand ) {
		program.name( rootCommand );
	}

	if ( rest.length ) {
		const usageValue = rest.join( ' ' );
		program.usage( usageValue.includes( '[options]' ) ? usageValue : `${ usageValue } [options]` );
	}
}

function getOptionSpec( name: string, defaultValue?: unknown ): string {
	const normalizedName = name.trim().replace( /^--?/, '' );
	if ( typeof defaultValue === 'boolean' ) {
		return `--${ normalizedName }`;
	}

	return `--${ normalizedName } <value>`;
}

function formatExamples( examples: Example[] ): string {
	if ( ! examples.length ) {
		return '';
	}

	const lines = examples.flatMap( example => [
		`  - ${ example.description }`,
		`    $ ${ example.usage }`,
		'',
	] );

	return [ '', 'Examples:', ...lines ].join( '\n' ).trimEnd();
}

export default class CommanderCompatCommand {
	private readonly options: Required< CommandOptions >;
	private readonly program: Command;
	private readonly examplesList: Example[] = [];
	private readonly subcommandNames = new Set< string >();

	constructor( opts: CommandOptions = {} ) {
		this.options = {
			usage: opts.usage ?? '',
			requiredArgs: opts.requiredArgs ?? 0,
			wildcardCommand: opts.wildcardCommand ?? false,
			format: opts.format ?? false,
		};

		this.program = new Command();
		normalizeUsage( this.program, this.options.usage );

		this.program
			.version(
				pkg.version,
				'-v, --version',
				'Retrieve the version number of VIP-CLI currently installed on the local machine.'
			)
			.helpOption(
				'-h, --help',
				'Retrieve a description, examples, and available options for a (sub)command.'
			)
			.option(
				'-d, --debug [namespaces]',
				'Generate verbose output during command execution to help identify or fix errors or bugs.',
				value => {
					const namespaces = value || '*';
					debugLib.enable( namespaces );
					process.env.DEBUG = namespaces;

					return value || true;
				}
			);

		if ( this.options.format ) {
			this.program.option(
				'--format <format>',
				'Render output in a particular format. Accepts “table“ (default), “csv“, and “json“.',
				'table'
			);
		}
	}

	public option( name: string, description: string, defaultValue?: unknown ): this {
		const spec = getOptionSpec( name, defaultValue );

		if ( undefined === defaultValue ) {
			this.program.option( spec, description );
		} else {
			this.program.option( spec, description, defaultValue as never );
		}

		return this;
	}

	public command( name: string, description?: string ): this {
		const subcommandName = name.trim().split( /\s+/ )[ 0 ];
		this.subcommandNames.add( subcommandName );
		this.program.command( name ).description( description ?? '' );

		return this;
	}

	public example( usage: string, description: string ): this {
		this.examplesList.push( {
			usage,
			description,
		} );

		return this;
	}

	public examples( examples: Example[] ): this {
		for ( const example of examples ) {
			this.examplesList.push( example );
		}

		return this;
	}

	// eslint-disable-next-line complexity
	public async argv( argv: string[], cb?: CommandCallback ): Promise< Record< string, unknown > > {
		const examplesText = formatExamples( this.examplesList );
		if ( examplesText ) {
			this.program.addHelpText( 'after', examplesText );
		}

		const parsedAlias = parseEnvAliasFromArgv( argv );
		await this.program.parseAsync( parsedAlias.argv );

		const options = this.program.opts< Record< string, unknown > >();

		if ( parsedAlias.app && ( options.app || options.env ) ) {
			exit.withError(
				'Please only use an environment alias, or the --app and --env parameters, but not both'
			);
		}

		if ( parsedAlias.app ) {
			options.app = parsedAlias.app;
			options.env = parsedAlias.env;
		}

		if (
			! this.options.wildcardCommand &&
			this.subcommandNames.size &&
			! this.program.args.length
		) {
			this.program.help();
		}

		if ( this.options.requiredArgs > this.program.args.length ) {
			this.program.help( { error: true } );
		}

		if ( process.env.NODE_ENV !== 'test' ) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const updateNotifier = require( 'update-notifier' ) as ( options: {
				pkg: typeof pkg;
				updateCheckInterval: number;
			} ) => { notify: ( options: { isGlobal: boolean } ) => void };

			updateNotifier( { pkg, updateCheckInterval: 1000 * 60 * 60 * 24 } ).notify( {
				isGlobal: true,
			} );
		}

		if ( ! cb ) {
			return options;
		}

		let result = ( await cb( this.program.args, options ) ) as CommandResult;
		if ( this.options.format && result ) {
			if ( ! Array.isArray( result ) && result.header && result.data ) {
				if ( options.format !== 'json' ) {
					console.log( formatData( result.header, 'keyValue' ) );
				}

				result = result.data;
			}

			if ( Array.isArray( result ) ) {
				const sanitized = result.map( row => {
					const output = { ...row };
					if ( Object.hasOwn( output, '__typename' ) ) {
						delete output.__typename;
					}

					return output;
				} );

				const outputFormat: OutputFormat =
					options.format === 'csv' || options.format === 'json' ? options.format : 'table';

				console.log(
					formatData(
						sanitized as Record< string, string | { toString: () => string } >[],
						outputFormat
					)
				);
			}
		}

		return options;
	}
}

export function command( opts: CommandOptions = {} ): CommanderCompatCommand {
	return new CommanderCompatCommand( opts );
}
