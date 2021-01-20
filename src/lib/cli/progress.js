// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import { stdout } from 'single-line-log';

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
 unknown: chalk.yellow( '✕' ),
};

// Various action steps for SQL imports
const steps = {
 replace: 'Performing Search and Replace',
 validate: 'Validating SQL',
 upload: 'Uploading file to S3',
	startImport: 'Starting import',
	import: 'Importing...'
	// Add more as neededs
};

// Progress update logs
export const progress = ( status, action ) => {
	const actionProgress = ` ${ marks[ status ] } ${ steps[ action ] }`;

	stdout( `${ actionProgress }` );
	console.log();
};