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
import { appQuery, updateNotificationStream } from 'lib/config/notifications';

// Command examples
const examples = [
	{
		usage: 'vip @mysite.develop config notifications edit 1234',
		description: 'Edit an existing notification stream for this environment',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	wildcardCommand: true,
	format: true,
	usage: 'vip @mysite.develop config notifications edit <notification_stream_id>',
} ).examples( examples ).argv( process.argv, async ( arg: string[], opt ) => {
	const trackingInfo = {
		environment_id: opt.env?.id,
		args: JSON.stringify( arg ), // TODO: remove some values we don't want tracked
	};
	await trackEvent( 'config_notifications_add_execute', trackingInfo );

	/**
     * TODO: Only ask user for a "recipient" and infer the stream type from it.
     */
	const [ notification_stream_id, streamType, streamValue, description, meta, active ] = arg;

	const result = await updateNotificationStream( opt.env.appId, opt.env.id, notification_stream_id, streamType, streamValue, description, meta, active );

	await trackEvent( 'config_notifications_update_success', trackingInfo );

	const streams = result?.data?.addNotificationStream?.nodes || [];

	// TODO: Return only the the added value instead of the whole list
//	const { notification_stream_id: , stream_value } = streams.find( ( { stream_type, stream_value } ) => stream_type === streamType && stream_value === streamValue );
//	console.log( `Successfully updated notification stream:\n\tID: ${ notification_stream_id }\n\tRecipient: ${ stream_value }` );
} );
