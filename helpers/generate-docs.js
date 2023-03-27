const { spawn } = require('child_process');
const path = require('path');

async function runCommand(subcommands) {
    let args = subcommands.concat('--help');
    const childProcess = spawn('vip', args);

    let output = '';

    for await (const data of childProcess.stdout) {
        output += data.toString();
    }
    for await (const data of childProcess.stderr) {
        output += data.toString();
    }

    const exitCode = await new Promise(resolve => {
        childProcess.on('exit', resolve);
    });

    if (exitCode !== 0) {
        console.log('o', output);
        throw new Error(`Script exited with code ${exitCode}`);
    }

    return output.trim();
}

const USAGE_REGEXP = /Usage: (.*)/;
const COMMAND_REGEXP = /(\S+)\s+(.*)/;
const OPTION_REGEXP = /(-\S, --\S+)\s+(.*)/;

const SECTION_COMMAND = 'commands';
const SECTION_OPTIONS = 'options';
const SECTION_EXAMPLES = 'examples';


const parseOutput = (output) => {
    const result = {};

    const lines = output.split('\n');
    let currentSection = '';

    for (let lineIx = 0; lineIx < lines.length; lineIx++) {
        const line = lines[lineIx].trim();
        if (!line) {
            continue;
        }
        if (line.startsWith('Usage:')) {
            result.usage = line.match(USAGE_REGEXP)[1];
            continue;
        }

        if (line.startsWith('Commands:')) {
            result.commands = [];
            currentSection = SECTION_COMMAND;
            continue;
        }
        if (line.startsWith('Options:')) {
            result.options = [];
            currentSection = SECTION_OPTIONS;
            continue;
        }
        if (line.startsWith('Examples:')) {
            result.examples = [];
            currentSection = SECTION_EXAMPLES;
            continue;
        }

        if (currentSection === SECTION_COMMAND) {
            const [_, command, description] = line.match(COMMAND_REGEXP);
            result.commands.push({
                command,
                description,
            });
            continue;
        }
        if (currentSection === SECTION_OPTIONS) {
            if (line.match(OPTION_REGEXP)) {
                const [_, option, description] = line.match(OPTION_REGEXP);
                result.options.push({
                    option,
                    description,
                });
            } else {
                console.log('Unknown option', line);
            }
            continue;
        }
        if (currentSection === SECTION_EXAMPLES) {
            let description = '';
            while(!lines[lineIx].trim().startsWith('$')) {
                description += lines[lineIx++];
            }
            const usage = lines[lineIx] && lines[lineIx].trim();
            result.examples.push({
                description,
                usage,
            });
        }

    }


    return result;
}

const processCommand = async (subcommands) => {
    const output = await runCommand(subcommands);
    const parsedOutput = parseOutput(output);

    const commandCount = parsedOutput.commands && parsedOutput.commands.length || 0;
    for (let commandIx = 0; commandIx < commandCount; commandIx++) {
        const element = parsedOutput.commands[commandIx];
        const commandOutput = await processCommand(subcommands.concat([element.command]));
        commandOutput.name = element.command;
        commandOutput.description = element.description;
        parsedOutput.commands[commandIx] = commandOutput;

    }

    return parsedOutput;
}

(async () => {
    const result = await processCommand([]);
    console.log(JSON.stringify(result, null, 2));
})()