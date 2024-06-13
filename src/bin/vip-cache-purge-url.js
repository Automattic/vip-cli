#!/usr/bin/env node

import { appQuery, purgeCache } from '../lib/api/cache-purge';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { readFromFile } from '../lib/read-file';
import { trackEvent } from '../lib/tracker';

const usage = 'vip cache purge-url';
const exampleUsage = 'vip @example-app.develop cache purge-url';

const examples = [
	{
		usage:
			`${ exampleUsage } https://example-app-develop.go-vip.co/sample-page/` +
			'\n    - Purged URL: https://example-app.develop.go-vip.co/sample-page/',
		description: 'Purge the page cache for a single URL.',
	},
	{
		usage: `${ exampleUsage } --from-file=./urls.txt`,
		description:
			'Purge the page cache for multiple URLs, each listed on a single line in a local file.',
	},
];

export async function cachePurgeCommand( urls = [], opt = {} ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip cache purge-url',
		env_id: opt.env.id,
		from_file: Boolean( opt.fromFile ),
	};

	await trackEvent( 'cache_purge_url_command_execute', trackingParams );

	if ( opt.fromFile ) {
		const value = await readFromFile( opt.fromFile );
		if ( value ) {
			urls = value.split( '\n' ).map( url => url.trim() );
		}
	}

	if ( ! urls.length ) {
		await trackEvent( 'cache_purge_url_command_error', {
			...trackingParams,
			error: 'No URL provided',
		} );

		exit.withError( 'Please supply at least one URL.' );
	}

	let purgeCacheObject = {};
	try {
		purgeCacheObject = await purgeCache( opt.app.id, opt.env.id, urls );
	} catch ( err ) {
		await trackEvent( 'cache_purge_url_command_error', { ...trackingParams, error: err.message } );

		exit.withError( `Failed to purge URL(s) from page cache: ${ err.message }` );
	}

	await trackEvent( 'cache_purge_url_command_success', trackingParams );

	purgeCacheObject.urls.forEach( url => {
		console.log( `- Purged URL: ${ url }` );
	} );
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	wildcardCommand: true,
	usage,
} )
	.option( 'from-file', 'Read URLs from a file, can be used to purge multiple URLs.' )
	.examples( examples )
	.argv( process.argv, cachePurgeCommand );
