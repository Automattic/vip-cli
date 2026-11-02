import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { ProgressTracker } from '../lib/cli/progress';
import { isSupportedApp } from '../lib/site-import/db-file-import';
import { importSqlCheckStatus } from '../lib/site-import/status';
import { trackEventWithEnv } from '../lib/tracker';

import type { App, AppEnvironment } from '../graphqlTypes';

const appQuery = `
id,
name,
type,
typeId,
environments{
	id
	appId
	type
	name
	isK8sResident
	primaryDomain {
		id
		name
	}
}
`;

const usage = 'vip import sql status';

// Command examples
const examples = [
	{
		usage: 'vip @example-app.develop import sql status',
		description:
			'Check the status of the most recent SQL database import to the develop environment of the "example-app" application.\n' +
			'       * If the import is still in progress, the command will poll until the import is complete.',
	},
];

export default command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	usage,
} )
	.examples( examples )
	.argv(
		process.argv,
		async ( _arg: string[], { app, env }: { app: App; env: AppEnvironment } ) => {
			const { id: envId, appId } = env;
			const track = trackEventWithEnv.bind( null, appId as number, envId as number );

			if ( ! isSupportedApp( app ) ) {
				await track( 'import_sql_command_error', { errorType: 'unsupported-app' } );
				exit.withError(
					'The type of application you specified does not currently support SQL imports.'
				);
			}

			await track( 'import_sql_check_status_command_execute' );

			const progressTracker = new ProgressTracker( [] );
			progressTracker.prefix = `
=============================================================
Checking the SQL import status for your environment...
`;

			await importSqlCheckStatus( {
				app,
				env,
				progressTracker,
				shouldReturnMissingJobImmediately: true,
			} );
		}
	);
