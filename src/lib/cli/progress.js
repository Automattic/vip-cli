// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import { stdout as progressLog } from 'single-line-log';
import { getGlyphForStatus } from 'lib/cli/format';

// Various action steps for SQL imports
export const progressSteps = [
	{ id: 'replace', name: 'Performing Search and Replace', status: 'pending' },
	{ id: 'validate', name: 'Validating SQL', status: 'pending' },
	{ id: 'upload', name: 'Uploading file to S3', status: 'pending' },
	{ id: 'startImport', name: 'Starting import', status: 'pending' },
	{ id: 'import', name: 'Importing...', status: 'pending' },
];

// Need to format the response to return an array
export const setStatusForCurrentAction = ( status, action ) => {
	const currentProgressSteps = progressSteps.map( step => {
		if ( step.id === action ) {
			step.status = status;
		}

		return step;
	} );
	
	return currentProgressSteps;
}

const completedSteps = [];

export function progress( steps: Object[], runningSprite: RunningSprite ) {
	const logs = steps.reduce(
		( carry, step ) => {
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
			statusOfAction = 'success'
		} else {
			statusOfAction = 'pending';
		}

		const outputStep = carry + `${ getGlyphForStatus( statusOfAction, runningSprite ) } ${ step.name }\n`;

  return outputStep;
	},
		''
	);
 
 return progressLog( logs );
}
