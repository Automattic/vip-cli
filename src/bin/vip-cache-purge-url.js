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
import { readFromFile } from 'lib/read-file';
import * as exit from 'lib/cli/exit';

const examples = [
	{
		usage: 'vip cache purge-url <URL>',
		description: 'Purge cache for a URL',
	},
	{
		usage: 'vip cache purge-url --from-file=/dev/vip/urls.txt',
		description: 'Purge cache for multiple URLs',
	},
];

export async function cachePurgeCommand( urls = [], opt = {} ): void {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip cache purge-url',
		env_id: opt.env.id,
		from_file: !! opt.fromFile,
	};

	await trackEvent( 'cache_purge_command_execute', trackingParams );

	if ( opt.fromFile ) {
		const value = await readFromFile( opt.fromFile );
		if ( value ) {
			urls = value.split( '\n' ).map( url => url.trim() );
		}
	}

	if ( ! urls.length ) {
		await trackEvent( 'cache_purge_command_error', trackingParams );

		exit.withError( 'You need at least one URL to purge the cache' );
	}

	let purgeCacheObject = {};
	try {
		purgeCacheObject = await purgeCache( opt.app.id, opt.env.id, urls );
	} catch ( err ) {
		await trackEvent( 'cache_purge_command_error', { ...trackingParams, error: err.message } );

		exit.withError( `Failed to purge cache object: ${ err.message }` );
	}

	await trackEvent( 'cache_purge_command_success', trackingParams );

	purgeCacheObject.urls.forEach( url => {
		console.log( `- Purged URL: ${ url }` );
	} );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	wildcardCommand: true,
	usage: 'vip cache purge-url <URL>',
} )
	.option( 'from-file', 'Read URLs from file (useful for multiline input)' )
	.examples( examples )
	.argv( process.argv, cachePurgeCommand );
