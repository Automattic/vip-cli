#!/usr/bin/env node

import { disableGlobalGraphQLErrorHandling } from '../lib/api';
import command from '../lib/cli/command';
import { fetchIntegrations } from '../lib/dev-environment/integrations';

interface Options {
	app?: string;
	env?: string;
}

async function fetchIntegrationsCommand( _args: string[], opts: Options ): Promise< void > {
	let response: Record< string, unknown >;
	if ( opts.app && opts.env ) {
		disableGlobalGraphQLErrorHandling();
		try {
			response = await fetchIntegrations( opts.app, opts.env );
		} catch ( error: unknown ) {
			const err = error instanceof Error ? error : new Error( String( error ) );
			response = { error: err.message };
			process.exitCode = 1;
		}
	} else {
		response = { error: 'Required parameters missing' };
		process.exitCode = 1;
	}

	process.stdout.write( JSON.stringify( response ) );
}

void command( { usage: 'vip internal fetch-integrations' } ).argv(
	process.argv,
	fetchIntegrationsCommand
);
