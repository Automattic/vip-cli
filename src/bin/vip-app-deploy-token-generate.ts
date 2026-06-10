#!/usr/bin/env node

import gql from 'graphql-tag';

import API from '../lib/api';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { makeCommandTracker } from '../lib/tracker';
import { parseApiError } from '../lib/utils';

import type { App, AppEnvironment } from '../graphqlTypes';

const usage = 'vip app deploy-token generate';

const examples = [
	{
		usage: 'vip @example-app.develop app deploy-token generate',
		description: 'Generate a custom deploy access token for the selected environment.',
	},
	{
		usage: 'vip @example-app.develop app deploy-token generate --format=json',
		description: 'Generate a custom deploy access token and print the result as JSON.',
	},
];

const appQuery = `
	id,
	name,
	environments{
		id
		appId
		type
		name
		uniqueLabel
	}
`;

const GENERATE_CUSTOM_DEPLOY_ACCESS_MUTATION = gql`
	mutation GenerateCustomDeployAccess($input: GenerateCustomDeployAccessInput) {
		generateCustomDeployAccess(input: $input) {
			token
			expiresAt
		}
	}
`;

interface GenerateCustomDeployAccessResult {
	generateCustomDeployAccess?: {
		token?: string | null;
		expiresAt?: string | null;
	} | null;
}

interface GenerateCustomDeployAccessVariables {
	input: {
		environmentIds: number[];
	};
}

export async function appDeployTokenGenerateCmd(
	_arg: string[],
	{ app, env }: { app: App; env: AppEnvironment }
) {
	const trackerFn = makeCommandTracker( 'deploy_token_generate', {
		app: app.id,
		env: env.uniqueLabel,
	} );
	await trackerFn( 'execute' );

	const envId = env.id;
	if ( typeof envId !== 'number' ) {
		await trackerFn( 'error', { error: 'Missing environment id' } );
		exit.withError( 'Failed to generate deploy token: environment id is missing.' );
		return;
	}

	const api = API();
	let response;

	try {
		response = await api.mutate<
			GenerateCustomDeployAccessResult,
			GenerateCustomDeployAccessVariables
		>( {
			mutation: GENERATE_CUSTOM_DEPLOY_ACCESS_MUTATION,
			variables: {
				input: {
					environmentIds: [ envId ],
				},
			},
		} );
	} catch ( err ) {
		const message =
			parseApiError( err as Parameters< typeof parseApiError >[ 0 ] ) ?? 'Unknown error';
		await trackerFn( 'error', { error: message } );
		exit.withError( `Failed to generate deploy token: ${ message }` );
		return;
	}

	const tokenPayload = response.data?.generateCustomDeployAccess;
	if ( ! tokenPayload?.token || ! tokenPayload.expiresAt ) {
		await trackerFn( 'error', { error: 'Missing generateCustomDeployAccess payload' } );
		exit.withError( 'Failed to generate deploy token: API returned an empty response.' );
		return;
	}

	await trackerFn( 'success' );

	return [
		{
			appId: app.id,
			appName: app.name,
			envId,
			env: env.uniqueLabel,
			token: tokenPayload.token,
			expiresAt: tokenPayload.expiresAt,
		},
	];
}

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	format: true,
	requiredArgs: 0,
	usage,
} )
	.examples( examples )
	.argv( process.argv, appDeployTokenGenerateCmd );
