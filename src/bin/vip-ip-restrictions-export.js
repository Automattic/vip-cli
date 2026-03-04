#!/usr/bin/env node

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { appQuery, getIPRestrictions, formatIPRestrictionsFile } from '../lib/api/ip-restrictions.ts';
import { trackEvent } from '../lib/tracker';

const usage = 'vip ip-restrictions export';
const exampleUsage = 'vip @example-app.develop ip-restrictions export';

const examples = [
	{
		usage: `${ exampleUsage } > ips.txt`,
		description: 'Export IP restrictions to a file',
	},
	{
		usage: `${ exampleUsage }`,
		description: 'Display IP restrictions in export format',
	},
];

export async function ipRestrictionsExportCommand( arg, opt ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: usage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
	};

	try {
		await trackEvent( 'ip_restrictions_export_command_execute', trackingParams );

		const config = await getIPRestrictions( opt.app.id, opt.env.id, opt.env );

		const envName = opt.env.uniqueLabel || `${ opt.app.name }.${ opt.env.type }`;
		const timestamp = new Date().toISOString().replace( 'T', ' ' ).split( '.' )[ 0 ] + ' UTC';

		const fileContent = formatIPRestrictionsFile( config.data, {
			environment: `@${ envName }`,
			timestamp,
		} );

		console.log( fileContent );

		await trackEvent( 'ip_restrictions_export_command_success', trackingParams );
	} catch ( error ) {
		await trackEvent( 'ip_restrictions_export_command_error', {
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
	.examples( examples )
	.argv( process.argv, ipRestrictionsExportCommand );
