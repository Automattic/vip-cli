import { Command as CommanderProgram } from 'commander';
import path from 'path';
import fs from 'fs';
import debugLib from 'debug';
import type { CommandDefinition } from '../lib/types';

const debug = debugLib('@automattic/vip:commands:registry');

/**
 * Command registry manifest
 * This is a static listing of all available commands
 */
const commandManifest: CommandDefinition[] = [
  {
    name: 'app',
    description: 'List and modify your VIP applications',
    path: './app',
    subcommands: [
      {
        name: 'list',
        description: 'List your VIP applications',
        path: './app/list',
      },
    ],
  },
  {
    name: 'dev-env',
    description: 'Use local dev-environment',
    path: './dev-env',
    subcommands: [
      {
        name: 'create',
        description: 'Create a new local dev environment',
        path: './dev-env/create',
      },
      {
        name: 'start',
        description: 'Start a local dev environment',
        path: './dev-env/start',
      },
      {
        name: 'stop',
        description: 'Stop a local dev environment',
        path: './dev-env/stop',
      },
      {
        name: 'destroy',
        description: 'Destroy a local dev environment',
        path: './dev-env/destroy', 
      },
    ],
  },
  // Add more top-level commands here as needed
];

/**
 * Dynamically load a command from its path
 */
async function loadCommand(commandDef: CommandDefinition): Promise<any> {
  try {
    // For resolving JS files after compilation
    const resolvedPath = path.resolve(__dirname, commandDef.path);
    debug(`Looking for command at ${resolvedPath}`);
    
    // Check multiple possible paths:
    // 1. Direct .js file (e.g., app.js)
    // 2. Directory with index.js (e.g., app/index.js)
    const jsPath = `${resolvedPath}.js`;
    const indexPath = path.join(resolvedPath, 'index.js');
    
    let finalPath: string | null = null;
    
    if (fs.existsSync(jsPath)) {
      debug(`Found command file at ${jsPath}`);
      finalPath = resolvedPath;
    } else if (fs.existsSync(indexPath)) {
      debug(`Found command file at ${indexPath}`);
      finalPath = path.join(resolvedPath, 'index');
    } else {
      debug(`Command file not found at ${jsPath} or ${indexPath}`);
      return null;
    }
    
    // Calculate the relative path from current file to the command file for import
    const relativePath = `./${path.relative(path.dirname(__filename), finalPath)}`;
    
    debug(`Importing from relative path: ${relativePath}`);
    const commandModule = await import(relativePath);
    return commandModule.default || commandModule;
  } catch (error) {
    debug(`Failed to load command ${commandDef.name}:`, error);
    return null;
  }
}

/**
 * Load and register a command and its subcommands
 */
async function registerCommand(
  program: CommanderProgram,
  commandDef: CommandDefinition,
  parentCommand?: CommanderProgram
): Promise<void> {
  const CommandClass = await loadCommand(commandDef);
  
  if (!CommandClass) {
    debug(`Skipping registration of ${commandDef.name} - not implemented yet`);
    
    // For now, register a placeholder command that notifies about the migration
    const targetCommand = parentCommand || program;
    targetCommand
      .command(commandDef.name)
      .description(`${commandDef.description} (migration in progress)`)
      .action(() => {
        console.log(`Command ${commandDef.name} is being migrated to the new CLI system.`);
        console.log(`For now, please use the original command: vip ${commandDef.name}`);
        process.exit(1);
      });
    
    return;
  }

  // Instantiate the command
  const commandInstance = new CommandClass();
  
  // Register the command with the parent
  const target = parentCommand || program;
  target.addCommand(commandInstance);
  
  // Register subcommands recursively
  if (commandDef.subcommands && commandDef.subcommands.length > 0) {
    for (const subcommand of commandDef.subcommands) {
      await registerCommand(program, subcommand, commandInstance);
    }
  }
}

/**
 * Load all commands from the manifest and register them with the program
 */
export async function loadCommands(program: CommanderProgram): Promise<void> {
  for (const commandDef of commandManifest) {
    await registerCommand(program, commandDef);
  }
} 