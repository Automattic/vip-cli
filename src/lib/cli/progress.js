// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import { stdout as progressLog } from 'single-line-log';

// Progress spinner
const sprite = {
	i: 0,
	sprite: [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ],
	next() {
		this.i++;

		if ( this.i >= this.sprite.length ) {
			this.i = 0;
		}

		return {
			value: this.sprite[ this.i ],
			done: false,
		};
	},
};

// Icons for different action states/status
const marks = {
	pending: '○',
	running: chalk.blueBright( sprite.next().value ),
	success: chalk.green( '✓' ),
	failed: chalk.red( '✕' ),
	skipped: chalk.green( '✕' ),
};

// Various action steps for SQL imports
const steps = {
	replace: 'Performing Search and Replace',
	validate: 'Validating SQL',
	upload: 'Uploading file to S3',
	startImport: 'Starting import',
	import: 'Importing...',
	// Add more as needed
};

// Progress Logs
let message;
let messages = [];
const completedSteps = [];

export const progress = ( currentStep, status ) => {
	for ( const key of Object.keys( steps ) ) {
		// Status of the current step in progress
		if ( key === currentStep ) {
			message = ` ${ marks[ status ] } ${ steps[ currentStep ] }`;
			messages.push( message );

			// Keep track of completed and skipped steps
			if ( status === 'success' ) {
				completedSteps.push( currentStep );
			}

			if ( status === 'skipped' ) {
				completedSteps.push( `${ currentStep }-skipped` );
			}
		}

		// Status of all the other steps
		if ( key !== currentStep ) {
			const stepCompleted = completedSteps.includes( key );

			const skipped = `${ key }-skipped`;

			const stepSkipped = completedSteps.find( step =>
				step === skipped
			);

			if ( stepSkipped === skipped ) {
				message = ` ${ marks.skipped } ${ steps[ key ] }`;
				messages.push( message );
			} else if ( stepCompleted ) {
				message = ` ${ marks.success } ${ steps[ key ] }`;
				messages.push( message );
			} else {
				message = chalk.dim( ` ${ marks.pending } ${ steps[ key ] }` );
				messages.push( message );
			}
		}
	}

	// Finally, print the progress logs
	progressLog( messages.join( '\n' ) );

	// Reset the messages array for each iteration
	messages = [];
};
