/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { currentUserCanImportForApp } from 'lib/media-import/media-file-import';
import { MediaImportProgressTracker } from 'lib/media-import/progress';
import { capitalize, formatEnvironment } from 'lib/cli/format';

import { RunningSprite } from '../cli/format';

const debug = debugLib( 'vip:lib/media-import/status' );

const IMPORT_MEDIA_PROGRESS_POLL_INTERVAL = 5000;

/*
 * TODO: Add support to
 *  failureDetails {
 *		previousStatus
 *		globalErrors
 *	}
 * (when Parker is ready)
 */
const IMPORT_MEDIA_PROGRESS_QUERY = gql`
	query App($appId: Int = 1, $envId: Int = 1) {
		app(id: $appId) {
			environments(id: $envId ) {
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
			}
		}
	}
}
`;

export type MediaImportCheckStatusInput = {
	app: Object,
	env: Object,
	MediaImportProgressTracker: MediaImportProgressTracker,
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
			return chalk.blueBright( runningSprite );
		case 'COMPLETED':
			return chalk.green( '✓' );
		case 'FAILED':
			return chalk.red( '✕' );
		case 'ABORTED':
		case 'ABORTING':
			return chalk.yellow( '✕' );
		default:
			return '';
	}
}

function buildErrorMessage( importFailed ) {
	let message = chalk.red( `Error: ${ importFailed.status }` );

	if ( 'FAILED' === importFailed.status ) {
		message += `
An error occurred: ${ importFailed.filesProcessed }/${ importFailed.filesTotal } files imported.

If this error persists, please contact support.
`;
	}
	return message;
}

export async function mediaImportCheckStatus( {
	app,
	env,
	progressTracker,
}: MediaImportCheckStatusInput ) {
	// Stop printing so we can pass our callback
	progressTracker.stopPrinting();

	// NO `console.log` in this function (until results are final)! It will break the progress printing.
	const api = await API();

	if ( ! currentUserCanImportForApp( app ) ) {
		throw new Error(
			'The currently authenticated account does not have permission to view Media import status.'
		);
	}
	let overallStatus = 'Checking...';

	const setProgressTrackerSuffix = () => {
		const sprite = getGlyphForStatus( overallStatus, progressTracker.runningSprite );

		const exitPrompt = '(Press ^C to hide progress. The import will continue in the background.)';

		let statusMessage;
		switch ( overallStatus ) {
			case 'COMPLETED':
				statusMessage = `Success ${ sprite } imported data should be visible on your site ${ env.primaryDomain.name }.`;
				break;
			case 'COMPLETING':
				statusMessage = `Finishing up... ${ sprite } `;
				break;
			// Intentionally no break to get default case:
			default:
				statusMessage = `${ capitalize( overallStatus ) } ${ sprite }`;
		}

		const maybeExitPrompt = `${ overallStatus === 'COMPLETING' ? exitPrompt : '' }`;

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
				} catch ( error ) {
					return reject( { error } );
				}

				const {
					importId,
					siteId,
					status,
					filesTotal,
					filesProcessed,
				} = mediaImportStatus;

				debug( {
					importId,
					siteId,
					status,
					filesTotal,
					filesProcessed,
				} );

				const failedMediaImport = ( 'FAILED' === status );

				if ( failedMediaImport ) {
					progressTracker.setStatus( mediaImportStatus );
					setSuffixAndPrint();
					/* TODO: Here we will add failure details */
					return reject( mediaImportStatus );
				}

				progressTracker.setStatus( mediaImportStatus );
				setSuffixAndPrint();

				if ( status === 'COMPLETED' ) {
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

		if ( typeof results === 'string' ) {
			overallStatus = results;
		} else {
			overallStatus = results?.status || 'unknown';
			// This shouldn't be 'unknown'...what should we do here?
		}

		progressTracker.stopPrinting();

		setProgressTrackerSuffix();

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
