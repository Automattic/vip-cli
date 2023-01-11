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
import { appQuery, addNotificationStream } from 'lib/config/notifications';

// Command examples
const examples = [
	{
		usage: 'vip @mysite.develop config notifications add',
		description: 'Add a new notification streams for this environment',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	wildcardCommand: true,
	format: true,
	usage: 'vip @mysite.develop config notifications add',
} ).examples( examples ).argv( process.argv, async ( arg: string[], opt ) => {
	const trackingInfo = {
		environment_id: opt.env?.id,
		args: JSON.stringify( arg ), // TODO: remove some values we don't want tracked
	};
	await trackEvent( 'config_notifications_add_execute', trackingInfo );

	/**
     * TODO: Only ask user for a "recipient" and infer the stream type from it.
     */
	const [ streamType, streamValue, description, meta ] = arg;

	const result = await addNotificationStream( opt.env.appId, opt.env.id, streamType, streamValue, true, description, meta );

	await trackEvent( 'config_notifications_add_success', trackingInfo );

	const streams = result?.data?.addNotificationStream?.nodes || [];

	// TODO: Return only the the added value instead of the whole list
	const { notification_stream_id, stream_value } = streams.find( ( { stream_type, stream_value } ) => stream_type === streamType && stream_value === streamValue );
	console.log( `Successfully added a new notification stream:\n\tID: ${ notification_stream_id }\n\tRecipient: ${ stream_value }` );
} );
