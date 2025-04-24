/**
 * Command delegation helpers - allows redirecting old-style commands to the new binary
 */

import { spawn } from 'child_process';
import path from 'path';
import debugLib from 'debug';

const debug = debugLib('@automattic/vip:compat:delegate');

/**
 * Maps the old command structure to new unified command structure
 */
const commandMapping = {
  'vip-app-list.js': ['app', 'list'],
  'vip-dev-env-create.js': ['dev-env', 'create'],
  'vip-dev-env-start.js': ['dev-env', 'start'],
  'vip-dev-env-stop.js': ['dev-env', 'stop'],
  'vip-dev-env-destroy.js': ['dev-env', 'destroy'],
  // Add more mappings as commands are migrated
};

/**
 * Delegate a command from old binary to new unified binary
 * 
 * @param args Command line arguments
 * @returns Promise that resolves when delegated command completes
 */
export async function delegateToNewBinary(args: string[] = []): Promise<void> {
  const currentScript = path.basename(args[1] || '');
  const newArgs = ['vip-new'];
  
  // If we have a mapping for this command, use it
  const commandArgs = commandMapping[currentScript];
  if (commandArgs) {
    newArgs.push(...commandArgs);
    
    // Add any additional arguments (skip the first two - node and script path)
    if (args.length > 2) {
      newArgs.push(...args.slice(2));
    }
    
    debug('Delegating command to new binary:', newArgs);
    
    // Spawn the new command and pass through stdio
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, newArgs, {
        stdio: 'inherit',
        env: process.env,
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  // If we don't have a mapping, we return and let the original command run
  debug('No mapping found for', currentScript, '- continuing with original command');
  return Promise.resolve();
}

/**
 * Check if a command should be delegated to the new binary
 * 
 * @param args Command line arguments
 * @returns Boolean indicating if command should be delegated
 */
export function shouldDelegateToNewBinary(args: string[] = []): boolean {
  const currentScript = path.basename(args[1] || '');
  const hasMapping = !!commandMapping[currentScript];
  
  // Check for special override flag that lets us disable delegation
  const disableDelegation = process.env.VIP_DISABLE_NEW_CLI === '1';
  
  return hasMapping && !disableDelegation;
} 