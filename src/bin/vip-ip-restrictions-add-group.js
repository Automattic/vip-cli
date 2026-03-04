#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { confirm } from '../lib/cli/prompt';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, getIPRestrictions, updateIPRestrictions } from '../lib/api/ip-restrictions.ts';
import { trackEvent } from '../lib/tracker';

const usage = 'vip ip-restrictions add-group';
const exampleUsage = 'vip @example-app.develop ip-restrictions add-group';

const examples = [
	{
		usage: `${ exampleUsage } --ips="192.168.1.0/24,10.0.0.5" --note="Office network"`,
		description: 'Add a group with multiple IPs',
	},
	{
		usage: `${ exampleUsage } --ips="1.2.3.4" --note="Malicious IP"`,
		description: 'Add a single IP',
	},
];

export async function ipRestrictionsAddGroupCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
	};

	try {
		await trackEvent( 'ip_restrictions_add_group_command_execute', trackingParams );

		if ( ! opt.ips || ! opt.note ) {
			console.log( chalk.red( 'Error: --ips and --note parameters are required' ) );
			console.log(
				chalk.gray( `Usage: ${ usage } --ips="<ip1>,<ip2>,..." --note="<description>"` )
			);
			process.exit( 1 );
		}

		// Parse IPs from comma-separated string
		const ips = opt.ips
			.split( ',' )
			.map( ip => ip.trim() )
			.filter( ip => ip );

		if ( ips.length === 0 ) {
			console.log( chalk.red( 'Error: No valid IPs provided' ) );
			process.exit( 1 );
		}

		// Get current configuration
		const currentConfig = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );

		// Create new group
		const newGroup = {
			ips,
			notes: opt.note,
		};

		// Add to existing groups
		const updatedGroups = [ ...currentConfig.data.groups, newGroup ];

		// Show what will be added
		console.log( chalk.bold( '\n➕ Adding IP Restriction Group' ) );
		console.log( chalk.gray( '─'.repeat( 50 ) ) );
		console.log( `Environment: ${ formatEnvironment( opt.env.type ) } - ${ opt.app.name }` );
		console.log( `Note: ${ opt.note }` );
		console.log( `IPs (${ ips.length }):` );
		for ( const ip of ips ) {
			console.log( `  • ${ ip }` );
		}
		console.log( chalk.gray( '─'.repeat( 50 ) ) );

		// Confirmation if not skipped
		if ( ! opt.confirm ) {
			const yes = await confirm(
				`Add this group to ${ formatEnvironment( opt.env.type ) } IP restrictions?`
			);

			if ( ! yes ) {
				await trackEvent( 'ip_restrictions_add_group_command_cancelled', trackingParams );
				console.log( '\nOperation cancelled.\n' );
				process.exit( 0 );
			}
		}

		// Update configuration
		await updateIPRestrictions( opt.app.id, opt.env.id, {
			action: currentConfig.data.action,
			groups: updatedGroups,
		} );

		console.log(
			chalk.green(
				`\n✓ Successfully added IP restriction group to ${ formatEnvironment( opt.env.type ) } - ${
					opt.app.name
				}`
			)
		);
		console.log(
			chalk.gray(
				`  Total groups: ${ updatedGroups.length } | Total IPs: ${ updatedGroups.reduce(
					( sum, g ) => sum + g.ips.filter( ip => ip ).length,
					0
				) }\n`
			)
		);

		await trackEvent( 'ip_restrictions_add_group_command_success', {
			...trackingParams,
			ip_count: ips.length,
		} );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_add_group_command_error', {
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
	.option( 'ips', 'Comma-separated list of IPs or CIDR ranges' )
	.option( 'note', 'Description/note for this group' )
	.option( 'confirm', 'Skip confirmation prompt', false )
	.examples( examples )
	.argv( process.argv, ipRestrictionsAddGroupCommand );
