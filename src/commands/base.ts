import { Command as CommanderCommand } from 'commander';
import chalk from 'chalk';
import debugLib from 'debug';
import Token from '../lib/token';
import { trackEvent } from '../lib/tracker';
import API from '../lib/api';
import UserError from '../lib/user-error';
import type { AppContext } from '../lib/types';

const debug = debugLib('@automattic/vip:commands:base');

/**
 * Base Command class for all VIP CLI commands
 * Extends Commander's Command with VIP-specific functionality
 */
export abstract class Command extends CommanderCommand {
  protected trackingEventName: string;
  protected appContext?: AppContext;
  protected requiresAuth: boolean = true;

  constructor(name: string) {
    super(name);
    this.trackingEventName = `${name}_command`;

    // Set up common error handling
    this.exitOverride((err) => {
      if (err.code === 'commander.help' || err.code === 'commander.version') {
        throw err; // Let Commander handle help and version
      }
      
      console.error(`\n${chalk.red('✕')} ${err.message}`);
      process.exit(1);
    });

    // Add common options
    this.option('--debug', 'Enable debug output');
    
    // Hook into action to set up common behaviors
    const originalAction = this.action.bind(this);
    this.action(async (args, options, command) => {
      try {
        if (options.debug) {
          debugLib.enable('*');
        }

        // Track command execution
        await this.trackCommandExecution();

        // Check authentication if required
        if (this.requiresAuth) {
          await this.ensureAuthenticated();
        }

        // Execute the original action
        return await originalAction(args, options, command);
      } catch (error) {
        if (error instanceof UserError) {
          console.error(`\n${chalk.red('✕')} ${error.message}`);
        } else {
          console.error(`\n${chalk.red('✕')} An unexpected error occurred:`);
          console.error(chalk.dim(error.stack || error.message));
          
          // Track error
          await trackEvent(`${this.trackingEventName}_error`, {
            error: error.message || 'Unknown error',
          });
        }
        process.exit(1);
      }
    });
  }

  /**
   * Track command execution
   */
  protected async trackCommandExecution(data: Record<string, any> = {}): Promise<void> {
    try {
      await trackEvent(this.trackingEventName, data);
    } catch (error) {
      debug('Failed to track event', error);
    }
  }

  /**
   * Ensure user is authenticated
   */
  protected async ensureAuthenticated(): Promise<void> {
    const token = await Token.get();
    
    if (!token || !token.valid()) {
      throw new UserError(
        'You need to be logged in to use this command. Please run `vip` to authenticate.'
      );
    }
  }

  /**
   * Get API client
   */
  protected async getAPI(): Promise<ReturnType<typeof API>> {
    return API();
  }
} 