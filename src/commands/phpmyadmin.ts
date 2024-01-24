/**
 * External dependencies
 */
import chalk from 'chalk';
import { GraphQLFormattedError } from 'graphql';
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import { App, AppEnvironment } from '../graphqlTypes';
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import * as exit from '../lib/cli/exit';
import { ProgressTracker } from '../lib/cli/progress';
import { CommandTracker } from '../lib/tracker';
import { pollUntil } from '../lib/utils';

export const GENERATE_PHP_MY_ADMIN_URL_MUTATION = gql`
	mutation GeneratePhpMyAdminAccess($input: GeneratePhpMyAdminAccessInput) {
		generatePHPMyAdminAccess(input: $input) {
			expiresAt
			url
		}
	}
`;

export const GET_PHP_MY_ADMIN_STATUS_QUERY = gql`
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

export const ENABLE_PHP_MY_ADMIN_MUTATION = gql`
	mutation EnablePhpMyAdmin($input: EnablePhpMyAdminInput) {
		enablePHPMyAdmin(input: $input) {
			success
		}
	}
`;

async function generatePhpMyAdminAccess( envId: number ): Promise< string > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();
	const resp = await api.mutate( {
		mutation: GENERATE_PHP_MY_ADMIN_URL_MUTATION,
		variables: {
			input: {
				environmentId: envId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return resp?.data?.generatePHPMyAdminAccess?.url as string;
}

async function enablePhpMyAdmin( envId: number ): Promise< string > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();
	const resp = await api.mutate( {
		mutation: ENABLE_PHP_MY_ADMIN_MUTATION,
		variables: {
			input: {
				environmentId: envId,
			},
		},
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return resp?.data?.generatePHPMyAdminAccess?.url as string;
}

async function getPhpMyAdminStatus( appId: number, envId: number ): Promise< string > {
	// Disable global error handling so that we can handle errors ourselves
	disableGlobalGraphQLErrorHandling();

	const api = await API();

	const resp = await api.query( {
		query: GET_PHP_MY_ADMIN_STATUS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	// Re-enable global error handling
	enableGlobalGraphQLErrorHandling();

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return resp?.data?.app?.environments?.[ 0 ]?.phpMyAdminStatus?.status as string;
}

export class PhpMyAdminCommand {
	app: App;
	env: AppEnvironment;
	silent?: boolean;
	track: CommandTracker;
	steps = {
		ENABLE: 'enable',
		GENERATE: 'generate',
	};
	private progressTracker: ProgressTracker;

	constructor( app: App, env: AppEnvironment, trackerFn: CommandTracker = async () => {} ) {
		this.app = app;
		this.env = env;
		this.track = trackerFn;
		this.progressTracker = new ProgressTracker( [
			{ id: this.steps.ENABLE, name: 'Enabling PHPMyAdmin for this site' },
			{ id: this.steps.GENERATE, name: 'Generating access link' },
		] );
	}

	log( msg: string ) {
		if ( this.silent ) {
			return;
		}
		console.log( msg );
	}

	stopProgressTracker() {
		this.progressTracker.print();
		this.progressTracker.stopPrinting();
	}

	async openUrl( url: string ) {
		const { default: open } = await import( 'open' );
		void open( url, { wait: false } );
	}

	async getStatus() {
		try {
			return await getPhpMyAdminStatus( this.app.id as number, this.env.id as number );
		} catch ( err ) {
			exit.withError(
				'Failed to get PhpMyAdmin status. Please try again. If the problem persists, please contact support.'
			);
		}
	}

	async enablePhpMyAdmin() {
		const status = await this.getStatus();
		if ( ! [ 'running', 'enabled' ].includes( status ) ) {
			await enablePhpMyAdmin( this.env.id as number );
			await pollUntil( this.getStatus.bind( this ), 1000, ( sts: string ) => sts === 'running' );

			// Additional 30s for LB routing to be updated
			await new Promise( resolve => setTimeout( resolve, 30000 ) );
		}
	}

	async run( silent = false ) {
		this.silent = silent;

		if ( ! this.app.id ) {
			exit.withError( 'No app was specified' );
		}

		if ( ! this.env.id ) {
			exit.withError( 'No environment was specified' );
		}

		const message =
			'Note: PHPMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail.';
		console.log( chalk.yellow( message ) );

		this.progressTracker.startPrinting();
		try {
			this.progressTracker.stepRunning( this.steps.ENABLE );
			await this.enablePhpMyAdmin();
			this.progressTracker.stepSuccess( this.steps.ENABLE );
		} catch ( err ) {
			this.progressTracker.stepFailed( this.steps.ENABLE );
			exit.withError( 'Failed to enable PhpMyAdmin' );
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
			exit.withError( `Failed to generate PhpMyAdmin URL: ${ error.message }` );
		}

		void this.openUrl( url );
		this.stopProgressTracker();
		this.log( 'PhpMyAdmin is opened in your default browser.' );
	}
}
