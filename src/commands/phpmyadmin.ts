/**
 * External dependencies
 */
import chalk from 'chalk';
import { GraphQLFormattedError } from 'graphql';
import gql from 'graphql-tag';
import opn from 'opn';

/**
 * Internal dependencies
 */
import { App, AppEnvironment } from '../graphqlTypes';
import API, {
	disableGlobalGraphQLErrorHandling,
	enableGlobalGraphQLErrorHandling,
} from '../lib/api';
import * as exit from '../lib/cli/exit';
import { CommandTracker } from '../lib/tracker';

export const GENERATE_PHP_MY_ADMIN_URL_MUTATION = gql`
	mutation GeneratePhpMyAdminAccess($input: GeneratePhpMyAdminAccessInput) {
		generatePHPMyAdminAccess(input: $input) {
			expiresAt
			url
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

export class PhpMyAdminCommand {
	app: App;
	env: AppEnvironment;
	silent?: boolean;
	track: CommandTracker;

	constructor( app: App, env: AppEnvironment, trackerFn: CommandTracker = async () => {} ) {
		this.app = app;
		this.env = env;
		this.track = trackerFn;
	}

	log( msg: string ) {
		if ( this.silent ) {
			return;
		}
		console.log( msg );
	}

	async run( silent = false ) {
		this.silent = silent;

		if ( ! this.env.id ) {
			exit.withError( 'No environment was specified' );
		}

		const message =
			'Note: PHPMyAdmin sessions are read-only. If you run a query that writes to DB, it will fail.';
		console.log( chalk.yellow( message ) );
		this.log( 'Generating PhpMyAdmin URL...' );

		let url;
		try {
			url = await generatePhpMyAdminAccess( this.env.id );
		} catch ( err ) {
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

		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		void opn( url, { wait: false } );
		this.log( 'PhpMyAdmin is opened in your default browser.' );
	}
}
