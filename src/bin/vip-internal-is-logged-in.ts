#!/usr/bin/env node

import { disableGlobalGraphQLErrorHandling } from '../lib/api';
import { getCurrentUserInfo } from '../lib/api/user';
import command from '../lib/cli/command';

import type { Me } from '../graphqlTypes';

async function isLoggedInCommand(): Promise< void > {
	let currentUser: Me;
	let response: Record< string, unknown >;

	disableGlobalGraphQLErrorHandling();

	try {
		currentUser = await getCurrentUserInfo( true );
		response = {
			displayName: currentUser.displayName,
			id: currentUser.id,
			isVIP: currentUser.isVIP,
		};
	} catch ( err: unknown ) {
		const error = err instanceof Error ? err : new Error( 'Unknown error' );
		response = {
			error: error.message,
		};

		process.exitCode = 1;
	}

	process.stdout.write( JSON.stringify( response ) );
}

void command( { usage: 'vip internal is-logged-in' } ).argv( process.argv, isLoggedInCommand );
