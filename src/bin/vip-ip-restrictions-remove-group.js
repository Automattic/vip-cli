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

const usage = 'vip ip-restrictions remove-group';
const exampleUsage = 'vip @example-app.develop ip-restrictions remove-group';

const examples = [
	{
		usage: `${ exampleUsage } abc123`,
		description: 'Remove a group by ID',
	},
	{
		usage: `${ exampleUsage } --note="Office network"`,
		description: 'Remove all groups with matching note',
	},
];

export async function ipRestrictionsRemoveGroupCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
	};

	try {
		await trackEvent( 'ip_restrictions_remove_group_command_execute', trackingParams );

		// Get current configuration
		const currentConfig = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );

		let groupsToRemove = [];
		let updatedGroups = [];

		// Remove by ID (positional argument)
		if ( arg[ 0 ] ) {
			const groupId = arg[ 0 ];
			groupsToRemove = currentConfig.data.groups.filter( g => g.id === groupId );
			updatedGroups = currentConfig.data.groups.filter( g => g.id !== groupId );

			if ( groupsToRemove.length === 0 ) {
				console.log( chalk.red( `Error: Group with ID "${ groupId }" not found` ) );
				console.log( chalk.gray( 'Run `vip ip-restrictions list` to see all groups' ) );
				process.exit( 1 );
			}
		} else if ( opt.note ) {
			// Remove by note
			groupsToRemove = currentConfig.data.groups.filter( g => g.notes === opt.note );
			updatedGroups = currentConfig.data.groups.filter( g => g.notes !== opt.note );

			if ( groupsToRemove.length === 0 ) {
				console.log( chalk.red( `Error: No groups found with note "${ opt.note }"` ) );
				console.log( chalk.gray( 'Run `vip ip-restrictions list` to see all groups' ) );
				process.exit( 1 );
			}
		} else {
			console.log( chalk.red( 'Error: Group ID or --note parameter is required' ) );
			console.log( chalk.gray( `Usage: ${ usage } <group-id>` ) );
			console.log( chalk.gray( `   or: ${ usage } --note="<note>"` ) );
			process.exit( 1 );
		}

		// Show what will be removed
		console.log( chalk.bold( '\n🗑️  Removing IP Restriction Group(s)' ) );
		console.log( chalk.gray( '─'.repeat( 50 ) ) );
		console.log( `Environment: ${ formatEnvironment( opt.env.type ) } - ${ opt.app.name }` );
		console.log( `Groups to remove: ${ groupsToRemove.length }` );

		for ( const group of groupsToRemove ) {
			const ipCount = group.ips.filter( ip => ip ).length;
			console.log( `\n  • ${ group.notes } (${ ipCount } IPs)` );
			console.log( chalk.gray( `    ID: ${ group.id }` ) );
		}

		console.log( chalk.gray( '\n' + '─'.repeat( 50 ) ) );

		// Confirmation if not skipped
		if ( ! opt.confirm ) {
			const yes = await confirm(
				`Remove ${ groupsToRemove.length } group(s) from ${ formatEnvironment(
					opt.env.type
				) } IP restrictions?`
			);

			if ( ! yes ) {
				await trackEvent( 'ip_restrictions_remove_group_command_cancelled', trackingParams );
				console.log( '\nOperation cancelled.\n' );
				process.exit( 0 );
			}
		}

		// Update configuration
		await updateIPRestrictions( opt.app.id, opt.env.id, {
			action: currentConfig.data.action,
			groups: updatedGroups,
		} );

		const totalRemovedIPs = groupsToRemove.reduce(
			( sum, g ) => sum + g.ips.filter( ip => ip ).length,
			0
		);

		console.log(
			chalk.green(
				`\n✓ Successfully removed ${ groupsToRemove.length } group(s) (${ totalRemovedIPs } IPs) from ${ formatEnvironment(
					opt.env.type
				) } - ${ opt.app.name }`
			)
		);
		console.log(
			chalk.gray(
				`  Remaining groups: ${ updatedGroups.length } | Remaining IPs: ${ updatedGroups.reduce(
					( sum, g ) => sum + g.ips.filter( ip => ip ).length,
					0
				) }\n`
			)
		);

		await trackEvent( 'ip_restrictions_remove_group_command_success', {
			...trackingParams,
			groups_removed: groupsToRemove.length,
			ips_removed: totalRemovedIPs,
		} );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_remove_group_command_error', {
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
	.option( 'note', 'Remove all groups with this note' )
	.option( 'confirm', 'Skip confirmation prompt', false )
	.examples( examples )
	.argv( process.argv, ipRestrictionsRemoveGroupCommand );
