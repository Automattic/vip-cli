/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import { promises as fsp } from 'fs';
import * as path from 'path';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { currentUserCanImportForApp } from 'lib/media-import/media-file-import';
import { MediaImportProgressTracker } from 'lib/media-import/progress';
import { capitalize, formatEnvironment, formatData } from 'lib/cli/format';

import { RunningSprite } from '../cli/format';

const IMPORT_MEDIA_PROGRESS_POLL_INTERVAL = 1000;

const IMPORT_MEDIA_PROGRESS_QUERY = gql`
	query App( $appId: Int, $envId: Int ) {
		app( id: $appId ) {
			environments( id: $envId ) {
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

export type MediaImportCheckStatusInput = {
	app: Object,
	env: Object,
	progressTracker: MediaImportProgressTracker,
};

async function getStatus( api, appId, envId ) {
	const response = await api.query( {
		query: IMPORT_MEDIA_PROGRESS_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const {
		data: {
			app: { environments },
		},
	} = response;
	if ( ! environments?.length ) {
		throw new Error( 'Unable to determine import status from environment' );
	}
	const [ environment ] = environments;
	const { mediaImportStatus } = environment;

	return mediaImportStatus;
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

function buildErrorMessage( importFailed ) {
	let message = '';

	if ( 'FAILED' === importFailed.status ) {
		const globalFailureDetails = importFailed.failureDetails;
		if ( globalFailureDetails ) {
			message += `${ chalk.red( 'Import failed at phase: ' ) }`;
			message += `${ chalk.redBright.bold( globalFailureDetails.previousStatus ) }\n\n`;
			message += chalk.red( 'Errors:' );
			globalFailureDetails.globalErrors.forEach( value => {
				message += `\n\t- ${ chalk.redBright.bold( value ) }`;
			} );
			return message;
		}
	}

	message += chalk.red( importFailed.error ? importFailed.error : importFailed );
	message += '\n\nIf this error persists and you are not sure on how to fix, please contact support';
	return message;
}

function buildFileErrors( fileErrors, exportFileErrorsToJson ) {
	if ( exportFileErrorsToJson ) {
		const fileErrorsToExport = fileErrors.map( fileError => { 
			return {
				fileName: fileError.fileName,
				errors: fileError.errors,
			};
		} );
		return formatData( fileErrorsToExport, 'json' );
	}

	let errorString = '';
	for ( const fileError of fileErrors ) {
		errorString += `File Name: ${ fileError.fileName }`;
		errorString += `\n\nErrors:\n\t- ${ fileError.errors }\n\n\n\n`;
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
			case 'COMPLETED':
				statusMessage = `COMPLETED ${ sprite } : The Imported files should be visible on your site ${ env.primaryDomain.name }`;
				break;
			default:
				statusMessage = `${ capitalize( overallStatus ) } ${ sprite }`;
		}

		const maybeExitPrompt = [ 'COMPLETED', 'ABORTED', 'FAILED' ].includes( overallStatus ) ? '' : exitPrompt;

		const suffix = `
=============================================================
Status: ${ statusMessage }
App: ${ app.name } (${ formatEnvironment( env.type ) })
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

	const getResults = () =>
		new Promise( ( resolve, reject ) => {
			const checkStatus = async () => {
				let mediaImportStatus;
				try {
					mediaImportStatus = await getStatus( api, app.id, env.id );
					if ( ! mediaImportStatus ) {
						return reject(
							{
								error: 'Requested app/environment is not available for this operation. If you think this is not correct, please contact Support.',
							} );
					}
				} catch ( error ) {
					return reject( { error } );
				}

				const {
					status,
				} = mediaImportStatus;

				const failedMediaImport = ( 'FAILED' === status );

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

				setTimeout( checkStatus, IMPORT_MEDIA_PROGRESS_POLL_INTERVAL );
			};

			// Kick off the check
			checkStatus();
		} );

	try {
		const results = await getResults();
		overallStatus = results?.status || 'unknown';

		progressTracker.stopPrinting();

		setProgressTrackerSuffix();
		progressTracker.print();

		const fileErrors = results.failureDetails?.fileErrors;
		if ( !! fileErrors && fileErrors.length > 0 ) {
			progressTracker.suffix += `${ chalk.yellow( `⚠️ ${ fileErrors.length } file error(s) found` ) }`;
			const formattedData = buildFileErrors( fileErrors, exportFileErrorsToJson );
			const errorsFile = `media-import-${ app.name }-${ Date.now() }${ !! exportFileErrorsToJson ? '.json' : '.txt' }`;
			try {
				await fsp.writeFile( errorsFile, formattedData );
				progressTracker.suffix += `\n${ chalk.yellow( `All errors have been exported to ${ chalk.bold( path.resolve( errorsFile ) ) }` ) }\n\n`;
			} catch ( writeFileErr ) {
				progressTracker.suffix += `\n${ chalk.red( `Could not export errors to file\n${ writeFileErr }` ) }\n\n`;
			}
		}

		// Print one final time
		progressTracker.print( { clearAfter: true } );

		process.exit( 0 );
	} catch ( importFailed ) {
		progressTracker.stopPrinting();
		progressTracker.print();
		progressTracker.suffix += `\n${ buildErrorMessage( importFailed ) }\n`;
		progressTracker.print( { clearAfter: true } );
		process.exit( 1 );
	}
}

export default {
	mediaImportCheckStatus,
};
