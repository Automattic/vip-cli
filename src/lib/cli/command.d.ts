import chalk = require('chalk');

interface CommandOptions {
	appContext: boolean;
	appQuery: string;
	childEnvContext: boolean;
	envContext: boolean;
	format: boolean;
	requireConfirm: boolean;
	requiredArgs: number;
	wildcardCommand: boolean;
	usage?: string;
	appQueryFragments?: string;
	module?: string;
	skipConfirmPrompt?: boolean;
}

export default function _default( opts: Partial< CommandOptions > ): Args;

interface Example {
	usage: string;
	description: string;
}

type OptionInitFunction = ( value: unknown ) => unknown;

interface MriOptions {
	args?: string[];
	alias?: Record< string, string | string[] >;
	boolean?: string | string[];
	default?: Record< string, unknown >;
	string?: string | string[];
	unknown?: ( param: string ) => boolean;
}

interface MinimistOptions {
	string?: string | string[];
	boolean?: boolean | string | string[];
	alias?: Record< string, string | string[] >;
	default?: Record< string, unknown >;
	stopEarly?: boolean;
	'--'?: boolean;
	unknown?: ( param: string ) => boolean;
}

interface ConfigurationOptions {
	help?: boolean;
	name?: string;
	version?: boolean;
	usageFilter?: ( output: unknown ) => unknown;
	value?: string;
	mri?: MriOptions;
	minimist?: MinimistOptions;
	mainColor?: string | string[];
	subColor?: string | string[];
}

interface Option {
	name: string | [ string, string ];
	description: string;
	init?: OptionInitFunction;
	defaultValue?: unknown;
}

interface Command {
	usage: string;
	description: string;
	init: Function | false;
}

declare class Args {
	details: {
		options: unknown[];
		commands: Command[];
		examples: Example[];
	};

	sub: string[];

	config: Required< ConfigurationOptions >;

	printMainColor: typeof chalk;
	printSubColor: typeof Chalk;

	constructor();

	option(
		name: string | [ string, string ],
		description: string,
		defaultValue?: unknown,
		init?: OptionInitFunction
	): Args;
	options( list: Option[] ): Args;
	command(
		name: string,
		description: string,
		init?: ( name: string, sub: string[], options: ConfigurationOptions ) => void,
		aliases?: string[]
	): Args;
	example( usage: string, description: string ): Args;
	examples( list: Example[] ): Args;
	parse( argv: string[], options?: ConfigurationOptions ): Record< string, unknown >;
	showHelp(): void;
	showVersion(): void;

	argv: ( argv: string[], cb: unknown ) => Promise< unknown >;

	// utils.js
	handleType( value: unknown ): [ string, ( ( v: unknown ) => unknown )? ];
	readOption( option: unknown ): Record< string, unknown >;
	getOptions( definedSubcommand: unknown ): Record< string, unknown >;
	generateExamples(): string[];
	generateDetails( kind: string ): string[];
	runCommand( details, options ): void;
	checkHelp(): void;
	checkVersion(): void;
	isDefined( name: string, list: string ): boolean;
	optionWasProvided( name: string ): boolean;
}
