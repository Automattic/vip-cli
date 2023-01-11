#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import command from 'lib/cli/command';
import { formatData } from 'lib/cli/format';
import { appQuery } from 'lib/config/notifications';
import UserError from 'lib/user-error';

// Command examples
const examples = [
	{
		usage: 'vip @mysite.develop config notifications list',
		description: 'Read current notification streams for this environment',
	},
	{
		usage: 'vip @mysite.develop config notifications list --format json',
		description: 'Read current notification streams for this environment (in JSON format)',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	wildcardCommand: true,
	format: true,
	usage: 'vip @mysite.develop config notifications list',
} ).examples( examples ).argv( process.argv, async ( arg: string[], opt ) => {
	const trackingInfo = {
		environment_id: opt.env?.id,
		args: JSON.stringify( arg ),
	};
	await trackEvent( 'config_notifications_list_execute', trackingInfo );

	const { notificationStreams } = opt.env;

	if ( notificationStreams === null ) {
		throw new UserError( 'Software settings are not supported for this environment.' );
	}

	const unformatted = ( notificationStreams.nodes || [] ).map( stream => {
		const _stream = { ...stream };
		delete _stream.__typename;
		return _stream;
	} );

	console.log( formatData( unformatted, opt.format ) );

	await trackEvent( 'config_notifications_list_success', trackingInfo );
} );
