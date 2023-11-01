import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import chalk from 'chalk';
import gql from 'graphql-tag';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AppQuery, AppQueryVariables } from './status.generated';
import {
	App,
	AppEnvironment,
	AppEnvironmentMediaImportStatus,
	AppEnvironmentMediaImportStatusFailureDetailsFileErrors,
	Maybe,
} from '../../graphqlTypes';
import API from '../../lib/api';
import { capitalize, formatEnvironment, formatData, RunningSprite } from '../../lib/cli/format';
import {
	AppForMediaImport,
	currentUserCanImportForApp,
} from '../../lib/media-import/media-file-import';
import { MediaImportProgressTracker } from '../../lib/media-import/progress';

const IMPORT_MEDIA_PROGRESS_POLL_INTERVAL = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 1000 * 60;
const TWO_MINUTES_IN_MILLISECONDS = 2 * ONE_MINUTE_IN_MILLISECONDS;

const IMPORT_MEDIA_PROGRESS_QUERY = gql`
	query App($appId: Int, $envId: Int) {
		app(id: $appId) {
			environments(id: $envId) {
				id
				name
				type
				repo
				mediaImportStatus {
					importId
					siteId
					status
					filesTotal
					filesProcessed
					failureDetails {
						previousStatus
						globalErrors
						fileErrors {
							fileName
							errors
						}
					}
				}
			}
		}
	}
`;

export interface MediaImportCheckStatusInput {
	app: App | AppForMediaImport;
	env: AppEnvironment;
	progressTracker: MediaImportProgressTracker;
	exportFileErrorsToJson: boolean;
}

async function getStatus(
	api: ApolloClient< NormalizedCacheObject >,
	appId: number,
	envId: number
): Promise< AppEnvironmentMediaImportStatus | null > {
	const response = await api.query< AppQuery, AppQueryVariables >( {
		query: IMPORT_MEDIA_PROGRESS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const environments = response.data.app?.environments;

	if ( ! environments?.length ) {
		throw new Error( 'Unable to determine import status from environment' );
	}
	const [ environment ] = environments;
	const { mediaImportStatus } = environment ?? {};

	return mediaImportStatus ?? null;
}

export function getGlyphForStatus( status: string, runningSprite: RunningSprite ) {
	switch ( status ) {
		case 'INITIALIZING':
			return '○';
		case 'INITIALIZED':
		case 'RUNNING':
		case 'COMPLETING':
		case 'RAN':
		case 'VALIDATING':
		case 'VALIDATED':
			return chalk.blueBright( runningSprite );
		case 'COMPLETED':
			return chalk.green( '✓' );
		case 'FAILED':
			return chalk.red( '✕' );
		case 'ABORTED':
		case 'ABORTING':
			return chalk.yellow( '⚠️' );
		default:
			return '';
	}
}

interface ImportFailedError extends Partial< AppEnvironmentMediaImportStatus > {
	error: string;
}

function buildErrorMessage( importFailed: ImportFailedError ) {
	let message = '';

	if ( 'FAILED' === importFailed.status ) {
		const globalFailureDetails = importFailed.failureDetails;
		if ( globalFailureDetails ) {
			message += `${ chalk.red( 'Import failed at status: ' ) }`;
			message += `${ chalk.redBright.bold( globalFailureDetails.previousStatus ) }\n`;
			message += chalk.red( 'Errors:' );
			globalFailureDetails.globalErrors?.forEach( value => {
				message += `\n\t- ${ chalk.redBright.bold( value ) }`;
			} );
			return message;
		}
	}

	message += chalk.red( importFailed.error ? importFailed.error : importFailed );
	message +=
		'\n\nPlease check the status of your Import using `vip import media status @mysite.production`';
	message +=
		'\n\nIf this error persists and you are not sure on how to fix, please contact support\n';
	return message;
}

function buildFileErrors(
	fileErrors: Maybe< AppEnvironmentMediaImportStatusFailureDetailsFileErrors >[],
	exportFileErrorsToJson: boolean
): string {
	if ( exportFileErrorsToJson ) {
		const fileErrorsToExport = fileErrors.map( fileError => {
			return {
				fileName: fileError?.fileName,
				errors: fileError?.errors,
			};
		} );
		return formatData( fileErrorsToExport, 'json' );
	}

	let errorString = '';
	for ( const fileError of fileErrors ) {
		errorString += `File Name: ${ fileError?.fileName ?? 'N/A' }`;
		errorString += `\n\nErrors:\n\t- ${
			fileError?.errors?.join( ', ' ) ?? 'unknown error'
		}\n\n\n\n`;
	}
	return errorString;
}

export async function mediaImportCheckStatus( {
	app,
	env,
	progressTracker,
	exportFileErrorsToJson,
}: MediaImportCheckStatusInput ) {
	// Stop printing so we can pass our callback
	progressTracker.stopPrinting();

	// NO `console.log` in this function (until results are final)! It will break the progress printing.
	const api = await API();

	if ( ! currentUserCanImportForApp( app ) ) {
		throw new Error(
			'The currently authenticated account does not have permission to view Media Import status.'
		);
	}
	let overallStatus = 'Checking...';

	const setProgressTrackerSuffix = () => {
		const sprite = getGlyphForStatus( overallStatus, progressTracker.runningSprite );

		const exitPrompt = '(Press ^C to hide progress. The import will continue in the background.)';

		let statusMessage;
		switch ( overallStatus ) {
			case 'INITIALIZING':
				statusMessage = `INITIALIZING ${ sprite } : We're downloading the files to be imported...`;
				break;
			case 'COMPLETED':
				statusMessage = `COMPLETED ${ sprite } : The imported files should be visible on your App`;
				break;
			default:
				statusMessage = `${ capitalize( overallStatus ) } ${ sprite }`;
		}

		const maybeExitPrompt = [ 'COMPLETED', 'ABORTED', 'FAILED' ].includes( overallStatus )
			? ''
			: exitPrompt;

		const suffix = `
=============================================================
Status: ${ statusMessage }
App: ${ app.name ?? 'N/A' } (${ formatEnvironment( env.type ?? 'N/A' ) })
=============================================================
${ maybeExitPrompt }
`;
		progressTracker.suffix = suffix;
	};

	const setSuffixAndPrint = () => {
		setProgressTrackerSuffix();
		progressTracker.print();
	};

	progressTracker.startPrinting( setSuffixAndPrint );

	const getResults = (): Promise< AppEnvironmentMediaImportStatus > =>
		// eslint-disable-next-line @typescript-eslint/no-shadow
		new Promise( ( resolve, reject ) => {
			let startDate = Date.now();
			let pollIntervalDecreasing = false;
			const checkStatus = async ( pollInterval: number ) => {
				let mediaImportStatus: AppEnvironmentMediaImportStatus | null = null;
				try {
					mediaImportStatus = await getStatus( api, app.id ?? -1, env.id ?? -1 );
					if ( ! mediaImportStatus ) {
						return reject( {
							error:
								'Requested app/environment is not available for this operation. If you think this is not correct, please contact Support.',
						} as ImportFailedError );
					}
				} catch ( error ) {
					return reject( { error: ( error as Error ).message } as ImportFailedError );
				}

				const status = mediaImportStatus.status ?? 'unknown';

				const failedMediaImport = 'FAILED' === status;

				if ( failedMediaImport ) {
					progressTracker.setStatus( mediaImportStatus );
					overallStatus = 'FAILED';
					setSuffixAndPrint();
					return reject( { ...mediaImportStatus, error: 'Import FAILED' } );
				}

				progressTracker.setStatus( mediaImportStatus );

				setSuffixAndPrint();

				if ( [ 'COMPLETED', 'ABORTED' ].includes( status ) ) {
					return resolve( mediaImportStatus );
				}
				overallStatus = status;

				// after two minutes, we'll start decreasing the pollInterval
				pollIntervalDecreasing =
					pollIntervalDecreasing || startDate < Date.now() - TWO_MINUTES_IN_MILLISECONDS;

				// decrease poll interval by a second, every minute
				if ( pollIntervalDecreasing && startDate < Date.now() - ONE_MINUTE_IN_MILLISECONDS ) {
					pollInterval = pollInterval + IMPORT_MEDIA_PROGRESS_POLL_INTERVAL;
					startDate = Date.now();
				}

				setTimeout( () => {
					void checkStatus( pollInterval );
				}, pollInterval );
			};

			// Kick off the check
			void checkStatus( IMPORT_MEDIA_PROGRESS_POLL_INTERVAL );
		} );

	try {
		const results = await getResults();
		overallStatus = results.status ?? 'unknown';

		progressTracker.stopPrinting();

		setProgressTrackerSuffix();
		progressTracker.print();

		const fileErrors = results.failureDetails?.fileErrors;
		if ( Boolean( fileErrors ) && fileErrors.length > 0 ) {
			progressTracker.suffix += `${ chalk.yellow(
				`⚠️  ${ fileErrors.length } file error(s) have been extracted`
			) }`;
			if ( ( results.filesTotal ?? 0 ) - ( results.filesProcessed ?? 0 ) !== fileErrors.length ) {
				progressTracker.suffix += `. ${ chalk.italic.yellow(
					'File-errors report size threshold reached.'
				) }`;
			}
			const formattedData = buildFileErrors( fileErrors, exportFileErrorsToJson );
			const errorsFile = `media-import-${ app.name ?? '' }-${ Date.now() }${
				exportFileErrorsToJson ? '.json' : '.txt'
			}`;
			try {
				await writeFile( errorsFile, formattedData );
				progressTracker.suffix += `\n\n${ chalk.yellow(
					`All errors have been exported to ${ chalk.bold( resolve( errorsFile ) ) }`
				) }\n\n`;
			} catch ( writeFileErr ) {
				progressTracker.suffix += `\n\n${ chalk.red(
					`Could not export errors to file\n${ ( writeFileErr as Error ).message }`
				) }\n\n`;
			}
		}

		// Print one final time
		progressTracker.print( { clearAfter: true } );

		process.exit( 0 );
	} catch ( importFailed ) {
		progressTracker.stopPrinting();
		progressTracker.print();
		progressTracker.suffix += `\n${ buildErrorMessage( importFailed as ImportFailedError ) }`;
		progressTracker.print( { clearAfter: true } );
		process.exit( 1 );
	}
}

export default {
	mediaImportCheckStatus,
};
