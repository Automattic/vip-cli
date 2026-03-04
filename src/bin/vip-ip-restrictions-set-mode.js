#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import prompts from 'prompts';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, getIPRestrictions, updateIPRestrictions } from '../lib/api/ip-restrictions';
import { trackEvent } from '../lib/tracker';

const usage = 'vip ip-restrictions set-mode';
const exampleUsage = 'vip @example-app.develop ip-restrictions set-mode';

const examples = [
	{
		usage: `${ exampleUsage } deny`,
		description: 'Switch to allowlist mode (only listed IPs allowed)',
	},
	{
		usage: `${ exampleUsage } allow`,
		description: 'Switch to blocklist mode (only listed IPs blocked)',
	},
];

function getModeDescription( mode ) {
	if ( mode === 'allow' ) {
		return 'blocklist - only listed IPs are blocked';
	}
	return 'allowlist - only listed IPs are allowed';
}

export async function ipRestrictionsSetModeCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
	};

	try {
		await trackEvent( 'ip_restrictions_set_mode_command_execute', trackingParams );

		const newMode = arg[ 0 ];

		if ( ! newMode || ( newMode !== 'allow' && newMode !== 'deny' ) ) {
			console.log( chalk.red( 'Error: Mode must be "allow" or "deny"' ) );
			console.log( chalk.gray( `Usage: ${ usage } <allow|deny>` ) );
			process.exit( 1 );
		}

		// Get current configuration
		const currentConfig = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );
		const currentMode = currentConfig.data.action;

		// Check if already in the target mode
		if ( currentMode === newMode ) {
			console.log( `\nAlready in ${ newMode.toUpperCase() } mode. No changes needed.\n` );
			await trackEvent( 'ip_restrictions_set_mode_already_set', trackingParams );
			process.exit( 0 );
		}

		// Mode is actually switching - show warning
		const hasGroups = currentConfig.data.groups && currentConfig.data.groups.length > 0;

		console.log(
			chalk.yellow(
				`\n⚠️  WARNING: Switching from ${ currentMode.toUpperCase() } mode to ${ newMode.toUpperCase() } mode\n`
			)
		);
		console.log(
			`Current mode: ${ chalk.bold( currentMode.toUpperCase() ) } (${ getModeDescription(
				currentMode
			) })`
		);
		console.log(
			`New mode: ${ chalk.bold( newMode.toUpperCase() ) } (${ getModeDescription( newMode ) })\n`
		);
		console.log( chalk.yellow( 'This will invert the security behavior of your site.\n' ) );

		if ( hasGroups ) {
			const totalIPs = currentConfig.data.groups.reduce(
				( sum, g ) => sum + g.ips.filter( ip => ip ).length,
				0
			);
			console.log(
				`You currently have ${ chalk.bold(
					currentConfig.data.groups.length
				) } groups with ${ chalk.bold( totalIPs ) } IP addresses configured.\n`
			);
		}

		// Prompt for what to do with existing IPs
		const response = await prompts( {
			type: 'select',
			name: 'action',
			message: 'What would you like to do with the existing IP list?',
			choices: [
				{
					title: 'Keep existing IPs (they will now have opposite meaning)',
					value: 'keep',
				},
				{ title: 'Clear all IPs and start fresh', value: 'clear' },
				{ title: 'Cancel this operation', value: 'cancel' },
			],
		} );

		if ( ! response.action || response.action === 'cancel' ) {
			await trackEvent( 'ip_restrictions_set_mode_cancelled', trackingParams );
			console.log( '\nOperation cancelled.\n' );
			process.exit( 0 );
		}

		const newGroups = response.action === 'clear' ? [] : currentConfig.data.groups;

		// Update configuration
		await updateIPRestrictions( opt.app.id, opt.env.id, {
			action: newMode,
			groups: newGroups,
		} );

		// Success message
		console.log();
		if ( response.action === 'clear' ) {
			console.log(
				chalk.green(
					`✓ Mode switched to ${ newMode.toUpperCase() } and all IP restrictions cleared`
				)
			);
		} else {
			console.log( chalk.green( `✓ Mode switched to ${ newMode.toUpperCase() }` ) );

			const totalIPs = currentConfig.data.groups.reduce(
				( sum, g ) => sum + g.ips.filter( ip => ip ).length,
				0
			);
			console.log( chalk.gray( '  Existing IPs preserved' ) );
			console.log(
				chalk.yellow(
					`\n⚠️  Remember: Your ${ totalIPs } IP addresses now have the opposite effect!`
				)
			);

			if ( newMode === 'deny' ) {
				console.log( chalk.yellow( '  Previously blocked IPs are now the ONLY allowed IPs.' ) );
			} else {
				console.log( chalk.yellow( '  Previously allowed IPs are now the ONLY blocked IPs.' ) );
			}
		}
		console.log();

		await trackEvent( 'ip_restrictions_set_mode_success', {
			...trackingParams,
			new_mode: newMode,
			action: response.action,
		} );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_set_mode_error', {
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
	requiredArgs: 1,
	usage,
} )
	.examples( examples )
	.argv( process.argv, ipRestrictionsSetModeCommand );
