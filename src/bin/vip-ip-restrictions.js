#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

const usage = 'vip ip-restrictions';
const exampleUsage = 'vip @example-app.develop ip-restrictions';

command( {
	requiredArgs: 0,
	usage,
} )
	.command( 'list', 'Display current IP restrictions configuration' )
	.command( 'set', 'Set IP restrictions from a file (replaces all)' )
	.command( 'export', 'Export IP restrictions to a file' )
	.command( 'add-group', 'Add a new IP restriction group' )
	.command( 'remove-group', 'Remove an IP restriction group' )
	.command( 'set-mode', 'Set the default action mode (allow/deny)' )
	.examples( [
		{
			usage: `${ exampleUsage } list`,
			description: 'Display current IP restrictions',
		},
		{
			usage: `${ exampleUsage } export > ips.txt`,
			description: 'Export IP restrictions to a file',
		},
		{
			usage: `${ exampleUsage } set --file=ips.txt --confirm`,
			description: 'Apply IP restrictions from a file',
		},
		{
			usage: `${ exampleUsage } set-mode deny`,
			description: 'Switch to allowlist mode (only listed IPs allowed)',
		},
	] )
	.argv( process.argv, () => {
		console.log( chalk.red( 'You must specify a subcommand.' ) );
		console.log( chalk.gray( 'Run `vip ip-restrictions --help` for usage information.' ) );
		process.exit( 1 );
	} );
