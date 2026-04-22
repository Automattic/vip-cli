/**
 * External dependencies
 */
import { ApolloClient } from '@apollo/client/core';
import chalk from 'chalk';
import gql from 'graphql-tag';
import { setTimeout } from 'node:timers/promises';

/**
 * Internal dependencies
 */
import {
	EnablePhpMyAdminMutation,
	EnablePhpMyAdminMutationVariables,
	GeneratePhpMyAdminAccessMutation,
	GeneratePhpMyAdminAccessMutationVariables,
	PhpMyAdminStatusQuery,
	PhpMyAdminStatusQueryVariables,
} from './phpmyadmin.generated';
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import * as exit from '../lib/cli/exit';
import { ProgressTracker, StepConstructorParam } from '../lib/cli/progress';
import { CommandTracker } from '../lib/tracker';
import { pollUntil } from '../lib/utils';

import type { App, AppEnvironment } from '../graphqlTypes';
import type { DocumentNode, GraphQLFormattedError } from 'graphql';

export const GENERATE_PHP_MY_ADMIN_URL_MUTATION: DocumentNode = gql`
	mutation GeneratePhpMyAdminAccess($input: GeneratePhpMyAdminAccessInput) {
		generatePHPMyAdminAccess(input: $input) {
			expiresAt
			url
		}
	}
`;

export const GET_PHP_MY_ADMIN_STATUS_QUERY: DocumentNode = gql`
	query PhpMyAdminStatus($appId: Int!, $envId: Int!) {
		app(id: $appId) {
			environments(id: $envId) {
				phpMyAdminStatus {
					status
				}
			}
		}
	}
`;

export const ENABLE_PHP_MY_ADMIN_MUTATION: DocumentNode = gql`
	mutation EnablePhpMyAdmin($input: EnablePhpMyAdminInput) {
		enablePHPMyAdmin(input: $input) {
			success
		}
	}
`;

async function generatePhpMyAdminAccess( envId: number ): Promise< string > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api: ApolloClient = API();
	const resp = await api.mutate<
		GeneratePhpMyAdminAccessMutation,
		GeneratePhpMyAdminAccessMutationVariables
	>( {
		mutation: GENERATE_PHP_MY_ADMIN_URL_MUTATION,
		variables: {
			input: {
				environmentId: envId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();

	return resp.data?.generatePHPMyAdminAccess?.url ?? '';
}

async function enablePhpMyAdmin( envId: number ): Promise< void > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api: ApolloClient = API();
	await api.mutate< EnablePhpMyAdminMutation, EnablePhpMyAdminMutationVariables >( {
		mutation: ENABLE_PHP_MY_ADMIN_MUTATION,
		variables: {
			input: {
				environmentId: envId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();
}

async function getPhpMyAdminStatus( appId: number, envId: number ): Promise< string > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api: ApolloClient = API();

	const resp = await api.query< PhpMyAdminStatusQuery, PhpMyAdminStatusQueryVariables >( {
		query: GET_PHP_MY_ADMIN_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();

	return resp.data?.app?.environments?.[ 0 ]?.phpMyAdminStatus?.status ?? '';
}

class MyProgressTracker extends ProgressTracker {
	public constructor(
		steps: StepConstructorParam[],
		private silent: boolean
	) {
		super( steps );
	}

	public setSilent( silent: boolean ): void {
		this.silent = silent;
	}

	public print(): void {
		if ( ! this.silent ) {
			super.print();
		}
	}

	public startPrinting( prePrintCallback?: () => unknown ): void {
		if ( ! this.silent ) {
			super.startPrinting( prePrintCallback );
		}
	}

	public stopPrinting(): void {
		if ( ! this.silent ) {
			super.stopPrinting();
		}
	}

	public stepRunning( stepId: string, additionalInfo?: string | string[] ): void {
		if ( ! this.silent ) {
			super.stepRunning( stepId, additionalInfo );
		}
	}

	public stepSuccess( stepId: string, additionalInfo?: string | string[] ): void {
		if ( ! this.silent ) {
			super.stepSuccess( stepId, additionalInfo );
		}
	}

	public stepFailed( stepId: string, additionalInfo?: string | string[] ): void {
		if ( ! this.silent ) {
			super.stepFailed( stepId, additionalInfo );
		}
	}
}

export class PhpMyAdminCommand {
	private silent?: boolean;
	private readonly steps = {
		ENABLE: 'enable',
		GENERATE: 'generate',
	};
	private readonly progressTracker: MyProgressTracker;

	constructor(
		private readonly app: App,
		private readonly env: AppEnvironment,
		private readonly track: CommandTracker = async () => {},
		silent = false
	) {
		this.silent = silent;
		this.progressTracker = new MyProgressTracker(
			[
				{ id: this.steps.ENABLE, name: 'Enabling phpMyAdmin for this environment' },
				{ id: this.steps.GENERATE, name: 'Generating access link' },
			],
			silent
		);
	}

	private log( msg: string ): void {
		if ( ! this.silent ) {
			console.log( msg );
		}
	}

	private stopProgressTracker(): void {
		this.progressTracker.print();
		this.progressTracker.stopPrinting();
	}

	public async openUrl( url: string ): Promise< unknown > {
		const { default: open } = await import( 'open' );
		return open( url, { wait: false } );
	}

	public async getStatus(): Promise< string > {
		return getPhpMyAdminStatus( this.app.id as number, this.env.id as number );
	}

	private async maybeEnablePhpMyAdmin(): Promise< void > {
		const status = await this.getStatus();
		if ( ! [ 'running', 'enabled' ].includes( status ) ) {
			await enablePhpMyAdmin( this.env.id as number );
			await pollUntil( this.getStatus.bind( this ), 1000, ( sts: string ) => sts === 'running' );

			// Additional 30s for LB routing to be updated
			await setTimeout( 30_000 );
		}
	}

	public async run( { print = false } = {} ): Promise< void > {
		if ( ! this.app.id ) {
			exit.withError( 'No app was specified' );
		}

		if ( ! this.env.id ) {
			exit.withError( 'No environment was specified' );
		}

		if ( ! this.silent ) {
			const message =
				'Note: PHPMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail.';
			console.log( chalk.yellow( message ) );
		}

		this.progressTracker.startPrinting();
		try {
			this.progressTracker.stepRunning( this.steps.ENABLE );
			await this.maybeEnablePhpMyAdmin();
			this.progressTracker.stepSuccess( this.steps.ENABLE );
		} catch ( err ) {
			this.progressTracker.stepFailed( this.steps.ENABLE );
			const error = err as Error & {
				graphQLErrors?: GraphQLFormattedError[];
			};
			void this.track( 'error', {
				error_type: 'enable_pma',
				error_message: error.message,
				stack: error.stack,
			} );
			this.stopProgressTracker();

			if ( error.graphQLErrors?.find( gqlError => gqlError.message === 'Unauthorized' ) ) {
				exit.withError(
					'You do not have sufficient permission to access phpMyAdmin for this environment.'
				);
			}

			exit.withError(
				'Failed to enable phpMyAdmin. Please try again. If the problem persists, please contact support.'
			);
		}

		let url;
		try {
			this.progressTracker.stepRunning( this.steps.GENERATE );
			url = await generatePhpMyAdminAccess( this.env.id );
			this.progressTracker.stepSuccess( this.steps.GENERATE );
		} catch ( err ) {
			this.progressTracker.stepFailed( this.steps.GENERATE );
			const error = err as Error & {
				graphQLErrors?: GraphQLFormattedError[];
			};
			void this.track( 'error', {
				error_type: 'generate_pma_url',
				error_message: error.message,
				stack: error.stack,
			} );
			this.stopProgressTracker();
			exit.withError( `Failed to generate phpMyAdmin URL: ${ error.message }` );
		}

		this.stopProgressTracker();

		if ( print ) {
			// Output only the URL to stdout for scripting/automation use
			console.log( url );
		} else {
			void this.openUrl( url );
			this.log( 'phpMyAdmin is opened in your default browser.' );
		}
	}
}
