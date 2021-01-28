// @flow

/**
 * External dependencies
 */
import { stdout as progressLog } from 'single-line-log';
import { getGlyphForStatus, RunningSprite } from 'lib/cli/format';

// Various action steps for SQL imports
export const SQL_IMPORT_PROGRESS_STEPS = [
	{ id: 'replace', name: 'Performing Search and Replace', status: 'pending' },
	{ id: 'validate', name: 'Validating SQL', status: 'pending' },
	{ id: 'upload', name: 'Uploading file to S3', status: 'pending' },
	{ id: 'import', name: 'Importing...', status: 'pending' },
];

// Need to format the response to return an array
export const setStatusForCurrentAction = ( status, action ) => {
	const currentProgressSteps = SQL_IMPORT_PROGRESS_STEPS.map( step => {
		if ( step.id === action ) {
			step.status = status;
		}

		return step;
	} );

	return currentProgressSteps;
};

// Instantiate a new instance of the RunningSprite class
const runningSprite = new RunningSprite();

// Keep track of completed and skipped steps
const completedSteps = [];

// Progress output logs
export function progress( steps: Object[] ) {
	// Iterate over each step and collect the logs to output
	const reducer = ( accumulator, step ) => {
		let statusOfAction;
		statusOfAction = step.status;

		const skipped = `${ step.id }-skipped`;
		const statusIcon = getGlyphForStatus( statusOfAction, runningSprite );

		// Keep track of completed and skipped steps
		if ( step.status === 'success' ) {
			completedSteps.push( step.id );
		}

		if ( step.status === 'skipped' ) {
			completedSteps.push( skipped );
		}

		const stepCompleted = completedSteps.includes( step.id );
		const stepSkipped = completedSteps.find( alreadyDone =>
			alreadyDone === skipped
		);

		// Specify status of completed or pending actions to avoid double logging
		if ( stepSkipped === skipped ) {
			statusOfAction = 'skipped';
		} else if ( stepCompleted ) {
			statusOfAction = 'success';
		} else {
			statusOfAction = 'pending';
		}

		const outputStep = accumulator + `${ statusIcon } ${ step.name }\n`;

		return outputStep;
	};

	const logs = steps.reduce( reducer, '' );

	// Output the logs
	return progressLog( logs );
}
