#!/usr/bin/env node

/**
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { getCurrentUserInfo } from '../lib/api/user';
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';
import * as exit from '../lib/cli/exit';

export async function whoamiCommand() {
	const trackingParams: { command: string } = {
		command: 'vip whoami',
	};

	await trackEvent( 'whoami_command_execute', trackingParams );

	let currentUser = {} as {
		displayName: string;
		id: number;
		isVIP: boolean;
	};
	try {
		currentUser = await getCurrentUserInfo();
	} catch ( err: any ) {
		await trackEvent( 'whoami_command_error', { ...trackingParams, error: err.message } );

		exit.withError( `Failed to fetch information about the currently logged-in user error: ${ err.message }` );
	}

	await trackEvent( 'whoami_command_success', trackingParams );

	const output: string[] = [
		`- Howdy ${ currentUser.displayName }!`,
		`- Your user ID is ${ currentUser.id }`,
	];

	if ( currentUser.isVIP ) {
		output.push( '- Your account has VIP Staff permissions' );
	}

	console.log( output.join( '\n' ) );
}

command( { usage: 'vip whoami' } )
	.examples( [
		{
			usage: 'vip whoami',
			description: 'Display details about the currently logged-in user.',
		},
	] )
	.argv( process.argv, whoamiCommand );
