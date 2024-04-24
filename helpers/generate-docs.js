const { spawn } = require( 'child_process' );
const { once } = require( 'events' );

async function runCommand( subcommands ) {
	const childProcess = spawn( 'vip', subcommands );

	let output = '';

	for await ( const data of childProcess.stdout ) {
		output += data.toString();
	}
	for await ( const data of childProcess.stderr ) {
		output += data.toString();
	}

	const [ exitCode ] = await once( childProcess, 'exit' );

	if ( exitCode !== 0 ) {
		console.log( 'o', output );
		throw new Error( `Script exited with code ${ exitCode }` );
	}

	return output.trim();
}

const USAGE_REGEXP = /Usage: (.*)/;
const COMMAND_REGEXP = /(\S+)\s+(.*)/;
const OPTION_REGEXP = /(-\S, --\S+)\s+(.*)/;

const SECTION_COMMAND = 'commands';
const SECTION_OPTIONS = 'options';
const SECTION_EXAMPLES = 'examples';

const parseOutput = output => {
	const result = {};

	const lines = output.split( '\n' );
	let currentSection = '';

	for ( let lineIx = 0; lineIx < lines.length; lineIx++ ) {
		const line = lines[ lineIx ].trim();
		if ( ! line ) {
			continue;
		}
		if ( line.startsWith( 'Usage:' ) ) {
			result.usage = line.match( USAGE_REGEXP )[ 1 ];
			continue;
		}

		if ( line.startsWith( 'Commands:' ) ) {
			result.commands = [];
			currentSection = SECTION_COMMAND;
			continue;
		}
		if ( line.startsWith( 'Options:' ) ) {
			result.options = [];
			currentSection = SECTION_OPTIONS;
			continue;
		}
		if ( line.startsWith( 'Examples:' ) ) {
			result.examples = [];
			result.examplesRaw = '';
			currentSection = SECTION_EXAMPLES;
			continue;
		}

		if ( currentSection === SECTION_COMMAND ) {
			const [ , command, description ] = line.match( COMMAND_REGEXP );
			result.commands.push( {
				command,
				description,
			} );
			continue;
		}
		if ( currentSection === SECTION_OPTIONS ) {
			if ( line.match( OPTION_REGEXP ) ) {
				const [ , option, description ] = line.match( OPTION_REGEXP );
				result.options.push( {
					option,
					description,
				} );
			} else {
				console.log( 'Unknown option', line );
			}
			continue;
		}
		if ( currentSection === SECTION_EXAMPLES ) {
			let description = '';
			while ( lines[ lineIx ] && ! lines[ lineIx ].trim().startsWith( '$' ) ) {
				const descriptionLine = lines[ lineIx ].trim();
				if ( description ) {
					description += '\n';
				}
				if ( result.examplesRaw ) {
					result.examplesRaw += '\n';
				}
				result.examplesRaw += descriptionLine;
				description += descriptionLine;
				lineIx++;
			}
			const usage = lines[ lineIx ] && lines[ lineIx ].trim();
			result.examplesRaw += '\n' + usage;
			result.examples.push( {
				description,
				usage,
			} );
		}
	}

	return result;
};

const processCommand = async subcommands => {
	const fullCommand = subcommands.join( ' ' );
	console.error( 'Processing', fullCommand, '...' );

	const output = await runCommand( subcommands.concat( [ '--help' ] ) );
	const parsedOutput = parseOutput( output );

	const commandCount = parsedOutput.commands?.length || 0;
	const commandOutputs = [];
	for ( let commandIx = 0; commandIx < commandCount; commandIx++ ) {
		const element = parsedOutput.commands[ commandIx ];
		// otherwise the parallel run will randomly fail on too many requests
		// eslint-disable-next-line no-await-in-loop
		commandOutputs.push( await processCommand( subcommands.concat( [ element.command ] ) ) );
	}
	console.error( `Processed ${ fullCommand } -> ${ commandOutputs.length } subcommands` );
	for ( let commandIx = 0; commandIx < commandCount; commandIx++ ) {
		const element = parsedOutput.commands[ commandIx ];
		const commandOutput = commandOutputs[ commandIx ];
		commandOutput.name = element.command;
		commandOutput.description = element.description;
		parsedOutput.commands[ commandIx ] = commandOutput;
	}

	return parsedOutput;
};

const main = async () => {
	const version = await runCommand( [ '--version' ] );

	console.error( 'triggering command processing...' );
	const result = await processCommand( [] );
	console.error( 'command processing done' );
	result.version = version;

	console.log( JSON.stringify( result, null, 2 ) );
};

main();
