#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, getIPRestrictions } from '../lib/api/ip-restrictions';
import { trackEvent } from '../lib/tracker';

const usage = 'vip ip-restrictions list';
const exampleUsage = 'vip @example-app.develop ip-restrictions list';

const examples = [
	{
		usage: exampleUsage,
		description: 'Display IP restrictions in table format',
	},
	{
		usage: `${ exampleUsage } --format=json`,
		description: 'Display IP restrictions in JSON format',
	},
];

function getModeDescription( mode ) {
	if ( mode === 'allow' ) {
		return 'blocklist - only listed IPs are blocked';
	}
	return 'allowlist - only listed IPs are allowed';
}

export async function ipRestrictionsListCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
	};

	try {
		await trackEvent( 'ip_restrictions_list_command_execute', trackingParams );

		const config = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );

		if ( opt.format === 'json' ) {
			console.log( JSON.stringify( config.data, null, 2 ) );
			await trackEvent( 'ip_restrictions_list_command_success', trackingParams );
			return;
		}

		// Table format
		const mode = config.data.action.toUpperCase();
		const modeDesc = getModeDescription( config.data.action );

		console.log( chalk.bold( `\nIP Restrictions - ${ mode } mode (${ modeDesc })` ) );

		if ( config.data.action === 'deny' ) {
			console.log( chalk.yellow( 'Only listed IPs are ALLOWED. All others are BLOCKED.' ) );
		} else {
			console.log( chalk.yellow( 'Only listed IPs are BLOCKED. All others are ALLOWED.' ) );
		}

		console.log();

		if ( ! config.data.groups || config.data.groups.length === 0 ) {
			console.log( chalk.gray( 'No IP restrictions configured.' ) );
		} else {
			let totalIPs = 0;

			for ( const group of config.data.groups ) {
				const ipCount = group.ips.filter( ip => ip ).length;
				totalIPs += ipCount;

				console.log( chalk.bold( `Group: ${ group.notes } (${ ipCount } IPs)` ) );
				console.log( chalk.gray( `  ID: ${ group.id }` ) );

				// Display IPs with tree structure
				for ( let i = 0; i < group.ips.length; i++ ) {
					const ip = group.ips[ i ];
					if ( ! ip ) {
						continue;
					}

					const prefix = i === group.ips.length - 1 ? '└─' : '├─';
					console.log( `  ${ prefix } ${ ip }` );
				}
				console.log();
			}

			console.log(
				chalk.gray( `Total: ${ config.data.groups.length } groups, ${ totalIPs } IP addresses` )
			);
		}

		console.log();
		await trackEvent( 'ip_restrictions_list_command_success', trackingParams );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_list_command_error', {
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
	format: true,
	requiredArgs: 0,
	usage,
} )
	.examples( examples )
	.argv( process.argv, ipRestrictionsListCommand );
