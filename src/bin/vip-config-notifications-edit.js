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
		usage: 'vip @mysite.develop config notifications edit <notificationStreamId> <recipient>',
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
} )
	.option( 'description', 'Specify an optional description for the notification stream.', '' )
	.option(
		'secret',
		'An optional secret for use in signing the webhook request body. Not valid for email subscriptions.'
	)
	.examples( examples ).argv( process.argv, async ( arg: string[], opt ) => {
		const trackingInfo = {
			environment_id: opt.env?.id,
			args: JSON.stringify( arg ), // TODO: remove some values we don't want tracked
		};
		await trackEvent( 'config_notifications_update_execute', trackingInfo );

		const [ _notificationStreamId, streamValue ] = arg;
		const notificationStreamId = parseInt( _notificationStreamId, 10 );

		if ( typeof notificationStreamId !== 'number' ) {
			console.error( 'Error: Notification stream ID must be an integer' );
			process.exit( 1 );
		}

		const { description, secret } = opt;

		const meta = {};

		if ( secret ) {
			meta.secret = secret;
		}
		console.log( { notificationStreamId, streamValue } );
//appId: number, envId: number, notificationStreamId: number, streamValue: string, description: string, meta: string, active: boolean
		const result = await updateNotificationStream(
			opt.env.appId,
			opt.env.id,
			notificationStreamId,
			streamValue,
			description,
			meta
		);

		await trackEvent( 'config_notifications_update_success', trackingInfo );

		const notificationStream = result?.data?.updateNotificationStream;

		console.log(
			`Successfully edited notification stream ID: ${ notificationStream.notification_stream_id }\n\tRecipient: ${ notificationStream.stream_value }`
		);
	} );
