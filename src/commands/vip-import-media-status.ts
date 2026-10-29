import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { isSupportedApp } from '../lib/media-import/media-file-import';
import { MediaImportProgressTracker } from '../lib/media-import/progress';
import { mediaImportCheckStatus } from '../lib/media-import/status';
import { trackEventWithEnv } from '../lib/tracker';

import type { App, AppEnvironment } from '../graphqlTypes';

const appQuery = `
	id,
	name,
	type,
	environments{
		id
		appId
		type
		name
		primaryDomain {
			id
			name
		}
	}
`;

const usage = 'vip import media status';

// Command examples
const examples = [
	{
		usage: 'vip @example-app.production import media status',
		description:
			'Check the status of the most recent media import.\n' +
			'       * If the import is still in progress, the command will poll until the import is complete.\n' +
			'       * If the import is already complete, the command will download an error log for the most recent import.',
	},
	{
		usage:
			'vip @example-app.production import media status --saveErrorLog --exportFileErrorsToJson',
		description:
			'Check the status of the most recent media import and automatically download the error log in JSON format.',
	},
];
export default command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 0,
	usage,
} )
	.option( 'exportFileErrorsToJson', 'Format an error log in JSON. Default is TXT.' )
	.option(
		'saveErrorLog',
		'Skip the confirmation prompt and download an error log automatically.',
		'prompt'
	)
	.examples( examples )
	.argv(
		process.argv,
		async (
			_arg: string[],
			{
				app,
				env,
				exportFileErrorsToJson,
				saveErrorLog,
			}: {
				app: App;
				env: AppEnvironment;
				exportFileErrorsToJson: boolean;
				saveErrorLog: string;
			}
		) => {
			const { id: envId, appId } = env;
			const track = trackEventWithEnv.bind( null, appId as number, envId as number );

			if ( ! isSupportedApp( app ) ) {
				await track( 'import_media_command_error', { errorType: 'unsupported-app' } );
				exit.withError(
					'The type of application you specified does not currently support this feature.'
				);
			}

			await track( 'import_media_check_status_command_execute' );

			const progressTracker = new MediaImportProgressTracker(
				[] as unknown as ConstructorParameters< typeof MediaImportProgressTracker >[ 0 ]
			);
			progressTracker.prefix = `
=============================================================
Checking the Media import status for your environment...
`;

			await mediaImportCheckStatus( {
				app,
				env,
				progressTracker,
				exportFileErrorsToJson,
				saveErrorLog,
			} );
		}
	);
