#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { confirm } from '../lib/cli/prompt';
import { formatEnvironment } from '../lib/cli/format';
import {
	appQuery,
	getIPRestrictions,
	updateIPRestrictions,
	parseIPRestrictionsFile,
} from '../lib/api/ip-restrictions';
import { trackEvent } from '../lib/tracker';

const usage = 'vip ip-restrictions set';
const exampleUsage = 'vip @example-app.develop ip-restrictions set';

const examples = [
	{
		usage: `${ exampleUsage } --file=ips.txt --confirm`,
		description: 'Set IP restrictions from a file',
	},
	{
		usage: `${ exampleUsage } --file=ips.txt`,
		description: 'Set IP restrictions with interactive confirmation',
	},
];

export async function ipRestrictionsSetCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		from_file: Boolean( opt.file ),
		skip_confirm: Boolean( opt.confirm ),
	};

	try {
		await trackEvent( 'ip_restrictions_set_command_execute', trackingParams );

		if ( ! opt.file ) {
			console.log( chalk.red( 'Error: --file parameter is required' ) );
			console.log( chalk.gray( `Usage: ${ usage } --file=<path>` ) );
			process.exit( 1 );
		}

		// Read and parse file
		let fileContent;
		try {
			const filePath = resolve( opt.file );
			fileContent = readFileSync( filePath, 'utf-8' );
		} catch ( error ) {
			console.log( chalk.red( `Error reading file: ${ error.message }` ) );
			process.exit( 1 );
		}

		const newConfig = parseIPRestrictionsFile( fileContent );

		// Validate configuration
		if ( ! newConfig.groups || newConfig.groups.length === 0 ) {
			console.log( chalk.yellow( '\n⚠️  Warning: File contains no IP restriction groups' ) );
			console.log( chalk.gray( 'This will remove all existing IP restrictions.\n' ) );
		}

		// Get current configuration
		const currentConfig = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );

		// Show what will change
		const currentCount = currentConfig.data.groups?.length || 0;
		const currentIPCount =
			currentConfig.data.groups?.reduce( ( sum, g ) => sum + g.ips.filter( ip => ip ).length, 0 ) ||
			0;
		const newCount = newConfig.groups.length;
		const newIPCount = newConfig.groups.reduce(
			( sum, g ) => sum + g.ips.filter( ip => ip ).length,
			0
		);

		console.log( chalk.bold( '\n🔄 IP Restrictions Update Summary' ) );
		console.log( chalk.gray( '─'.repeat( 50 ) ) );
		console.log( `Environment: ${ formatEnvironment( opt.env.type ) } - ${ opt.app.name }` );
		console.log(
			`Mode: ${ currentConfig.data.action.toUpperCase() } → ${ newConfig.action.toUpperCase() }`
		);
		console.log( `Groups: ${ currentCount } → ${ newCount }` );
		console.log( `IP Addresses: ${ currentIPCount } → ${ newIPCount }` );
		console.log( chalk.gray( '─'.repeat( 50 ) ) );

		if ( currentConfig.data.action !== newConfig.action ) {
			console.log(
				chalk.yellow( '\n⚠️  Mode is changing! This will affect how IPs are treated.' )
			);
		}

		// Confirmation if not already provided
		if ( ! opt.confirm ) {
			console.log(
				chalk.yellow(
					'\n⚠️  This will REPLACE all existing IP restrictions with the file contents.'
				)
			);

			const yes = await confirm(
				`Are you sure you want to update IP restrictions for ${ formatEnvironment(
					opt.env.type
				) }?`
			);

			if ( ! yes ) {
				await trackEvent( 'ip_restrictions_set_command_cancelled', trackingParams );
				console.log( 'Operation cancelled.' );
				process.exit( 0 );
			}
		}

		// Update IP restrictions
		await updateIPRestrictions( opt.app.id, opt.env.id, newConfig );

		console.log(
			chalk.green(
				`\n✓ Successfully updated IP restrictions for ${ formatEnvironment( opt.env.type ) } - ${
					opt.app.name
				}`
			)
		);
		console.log(
			chalk.gray(
				`  Mode: ${ newConfig.action.toUpperCase() } | Groups: ${ newCount } | IPs: ${ newIPCount }\n`
			)
		);

		await trackEvent( 'ip_restrictions_set_command_success', trackingParams );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_set_command_error', {
			...trackingParams,
			error: error.message,
		} );
		throw error;
	}
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	usage,
} )
	.option( 'file', 'Path to IP restrictions file' )
	.option( 'confirm', 'Skip confirmation prompt (USE WITH CAUTION)', false )
	.examples( examples )
	.argv( process.argv, ipRestrictionsSetCommand );
