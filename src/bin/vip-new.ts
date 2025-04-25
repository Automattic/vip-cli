#!/usr/bin/env node

/**
 * Main entry point for the VIP CLI using the unified command architecture
 */

import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import debugLib from 'debug';
import chalk from 'chalk';
import pkg from '../../package.json';
import Token from '../lib/token';
import LoginCommand from '../commands/login';
import { loadCommands } from '../commands/registry';
import UserError from '../lib/user-error';

const debug = debugLib('@automattic/vip:bin:vip-new');

/**
 * Setup error handling
 */
function setupErrorHandling(): void {
  process.on('uncaughtException', uncaughtError);
  process.on('unhandledRejection', uncaughtError);
}

/**
 * Handle uncaught errors
 */
function uncaughtError(err): void {
  // Error raised when trying to write to an already closed stream
  if (err.code === 'EPIPE') {
    return;
  }
  
  if (err instanceof UserError) {
    console.error(`\n${chalk.red('✕')} ${err.message}`);
    process.exit(1);
  }

  console.log(chalk.red('✕'), 'Please contact VIP Support with the following information:');
  console.log(chalk.dim(err.stack));

  process.exit(1);
}

/**
 * Check for updates
 */
function checkForUpdates(): void {
  // Check for updates every day
  updateNotifier({ 
    pkg, 
    isGlobal: true, 
    updateCheckInterval: 1000 * 60 * 60 * 24 
  }).notify();
}

/**
 * Check if --debug flag is present and enable debugging
 */
function setupDebug(): void {
  const isDebugEnabled = process.argv.some(arg => arg === '--debug' || arg.startsWith('--debug='));
  
  if (isDebugEnabled) {
    // Find debug arg
    const debugArg = process.argv.find(arg => arg.startsWith('--debug='));
    
    // If debug has a value (--debug=pattern), use that pattern, otherwise enable all
    let debugPattern = '*';
    if (debugArg && debugArg.startsWith('--debug=')) {
      debugPattern = debugArg.split('=')[1];
    }
    
    // Enable debug output
    debugLib.enable(debugPattern);
    debug(`Debug enabled with pattern: ${debugPattern}`);
    
    // Remove from argv to prevent Commander from complaining
    // But keep it in the environment for child processes
    process.env.DEBUG = debugPattern;
    
    // Filter out debug args
    process.argv = process.argv.filter(arg => arg !== '--debug' && !arg.startsWith('--debug='));
  }
}

/**
 * Check if a user needs to login
 */
async function checkAuthentication(program: Command): Promise<boolean> {
  // Skip authentication check for help, version, login
  const isHelpCommand = process.argv.some(arg => ['--help', '-h', 'help'].includes(arg));
  const isVersionCommand = process.argv.some(arg => ['--version', '-v', 'version'].includes(arg));
  const isLoginCommand = process.argv.some(arg => ['login'].includes(arg));
  
  if (isHelpCommand || isVersionCommand || isLoginCommand) {
    return true;
  }
  
  const token = await Token.get();
  
  if (!token || !token.valid()) {
    // User is not authenticated, register login command
    const loginCommand = new LoginCommand();
    program.addCommand(loginCommand);
    
    // If user is trying to run an actual command, show login first
    if (process.argv.length > 2) {
      console.log(`You need to login first to use the VIP CLI.`);
      process.argv = [process.argv[0], process.argv[1], 'login'];
    } else {
      // Just running 'vip' without commands - show login screen
      process.argv = [process.argv[0], process.argv[1], 'login'];
    }
    
    return false;
  }
  
  return true;
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  try {
    setupDebug();
    setupErrorHandling();
    checkForUpdates();
    
    // Set up the main program
    const program = new Command()
      .name('vip')
      .description('VIP CLI is your tool for interacting with and managing your VIP applications')
      .version(pkg.version);
    
    // Check if we have a valid auth token
    const isAuthenticated = await checkAuthentication(program);
    
    // If authenticated, load all commands
    if (isAuthenticated) {
      await loadCommands(program);
    }
    
    debug('Ready to parse arguments:', process.argv);
    
    // Parse and execute
    await program.parseAsync(process.argv);
    
  } catch (error) {
    uncaughtError(error);
  }
}

// Start the CLI
main().catch(uncaughtError); 