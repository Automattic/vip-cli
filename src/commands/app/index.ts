import { Command } from '../base';

/**
 * App command - Parent command for app-related subcommands
 */
export default class AppCommand extends Command {
  constructor() {
    super('app');
    this.description('List and modify your VIP applications');
  }
} 