#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { appQuery, purgeCache } from 'lib/api/cache-purge';
import command from 'lib/cli/command';
import { trackEvent } from 'lib/tracker';
import * as exit from 'lib/cli/exit';

const examples = [
	{
		usage: 'vip @123.production cache purge <URL1> <URL2>',
		description: 'Clear cache for a Node.js URL',
	},
];

export async function cachePurgeCommand( urls, opt ): void {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip cache purge',
		env_id: opt.env.id,
	};

	await trackEvent( 'cache_purge_command_execute', trackingParams );

	let purgeCacheObject = {};
	try {
		purgeCacheObject = await purgeCache( opt.app.id, opt.env.id, urls );
	} catch ( err ) {
		await trackEvent( 'cache_purge_command_error', { ...trackingParams, error: err.message } );

		exit.withError( `Failed to purge cache object error: ${ err.message }` );
	}

	await trackEvent( 'cache_purge_command_success', trackingParams );

	const output = [
		`- Purged URLs: ${ purgeCacheObject.urls.join( ',' ) }`,
	];

	console.log( output.join( '\n' ) );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	wildcardCommand: true,
} )
	.examples( examples )
	.argv( process.argv, cachePurgeCommand );
