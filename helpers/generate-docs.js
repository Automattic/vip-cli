const { spawn } = require('child_process');
const path = require('path');

async function runCommand(command) {
    const commandPath = path.join(__dirname, '..', 'dist', 'bin', command + '.js');
    const childProcess = spawn('node', [commandPath, '--help']);

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


const parseOutput = (output) => {
    const result = {};

    const lines = output.split('\n');
    let currentSection = SECTION_COMMAND;

    for (const fullLine of lines) {
        const line = fullLine.trim();
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

        if (currentSection === SECTION_COMMAND) {
            const [_, command, description] = line.match(COMMAND_REGEXP);
            result.commands.push({
                command,
                description,
            });
            continue;
        }
        if (currentSection === SECTION_OPTIONS) {
            const [_, option, description] = line.match(OPTION_REGEXP);
            result.options.push({
                option,
                description,
            });
            continue;
        }

    }


    return result;
}

const processCommand = async (command) => {
    const output = await runCommand(command);
    const parsedOutput = parseOutput(output);
    return parsedOutput;
}

(async () => {
    const result = await processCommand('vip');
    console.log(JSON.stringify(result, null, 2));

})()