#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { shouldDelegateToNewBinary, delegateToNewBinary } from '../lib/compat/delegate';

// Original imports that would be used if delegation fails
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';
import * as exit from '../lib/cli/exit';

const debug = debugLib('@automattic/vip:bin:vip-app-list');

/**
 * Main function to handle running this command
 */
async function main() {
	try {
		// Try to delegate to the new CLI first
		if (shouldDelegateToNewBinary(process.argv)) {
			await delegateToNewBinary(process.argv);
			return;
		}

		// If we get here, delegation failed or was disabled
		// so we fall back to the original implementation
		debug('Using original implementation');

		// Original command implementation
		const cmd = command();
		cmd.option('format', 'Output format (table, json, csv)', 'table');
		cmd.app();

		await trackEvent('app_list_command_execute');

		cmd.argv(process.argv, async (arg, opt) => {
			// Original implementation would go here
			console.log(chalk.yellow('Warning: Using legacy implementation of app list command.'));
			// ... the rest of the original command ...
		});
	} catch (error) {
		console.error(chalk.red('Error:'), error.message);
		process.exit(1);
	}
}

main().catch(err => {
	console.error(chalk.red('Unexpected error:'), err.message);
	debug(err);
	process.exit(1);
});
