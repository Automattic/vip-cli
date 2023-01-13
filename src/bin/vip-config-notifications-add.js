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
	requiredArgs: 1,
	usage: 'vip @mysite.develop config notifications add',
} )
	.option( 'description', 'Specify an optional description for the notification stream.', '' )
	.option(
		'secret',
		'An optional secret for use in signing the webhook request body. Not valid for email subscriptions.'
	)
	.examples( examples )
	.argv( process.argv, async ( arg: string[], opt ) => {
		const trackingInfo = {
			environment_id: opt.env?.id,
			args: JSON.stringify( arg ), // TODO: remove some values we don't want tracked
		};
		await trackEvent( 'config_notifications_add_execute', trackingInfo );

		const [ streamValue ] = arg;

		const { description, secret } = opt;

		const meta = {};

		if ( secret ) {
			meta.secret = secret;
		}

		const result = await addNotificationStream(
			opt.env.appId,
			opt.env.id,
			streamValue,
			description,
			meta
		);

		await trackEvent( 'config_notifications_add_success', trackingInfo );

		const streams = result?.data?.addNotificationStream?.nodes || [];

		console.log( { streams } );

		console.log(
			`Successfully added a new notification stream.`
			//:\n\tID: ${ notification_stream_id }\n\tRecipient: ${ stream_value }`
		);
	} );
