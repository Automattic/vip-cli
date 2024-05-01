#!/usr/bin/env node

import { User } from '../graphqlTypes';
import { getCurrentUserInfo } from '../lib/api/user';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip whoami';

export async function whoamiCommand() {
	const trackingParams: { command: string } = {
		command: 'vip whoami',
	};

	await trackEvent( 'whoami_command_execute', trackingParams );

	let currentUser: User;
	try {
		currentUser = await getCurrentUserInfo();
	} catch ( err: unknown ) {
		const error = err instanceof Error ? err : new Error( 'Unknown error' );
		await trackEvent( 'whoami_command_error', { ...trackingParams, error: error.message } );

		exit.withError(
			`Failed to fetch information about the currently logged-in user error: ${ error.message }`
		);
	}

	await trackEvent( 'whoami_command_success', trackingParams );

	const output: string[] = [
		`- Howdy ${ currentUser.displayName ?? 'user' }!`,
		`- Your user ID is ${ currentUser.id ?? ' not found' }`,
	];

	if ( currentUser.isVIP ) {
		output.push( '- Your account has VIP Staff permissions' );
	}

	console.log( output.join( '\n' ) );
}

void command( { usage: baseUsage } )
	.examples( [
		{
			usage: baseUsage + '\n' + '    - Howdy user@example.com!\n' + '    - Your user ID is 1234\n',
			description: 'Retrieve details about the current authenticated VIP-CLI user.',
		},
	] )
	.argv( process.argv, whoamiCommand );
