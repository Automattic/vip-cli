import { Command } from '../base';

/**
 * Dev Environment command - Parent command for dev-env-related subcommands
 */
export default class DevEnvCommand extends Command {
  constructor() {
    super('dev-env');
    this.description('Use local dev-environment');
  }
} 