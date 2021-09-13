// @flow
/** @format */

/**
 * External dependencies
 */
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import { getGlyphForStatus } from 'lib/media-import/status';
import { RunningSprite } from 'lib/cli/format';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.

export class MediaImportProgressTracker {
	hasFailure: boolean;
	hasPrinted: boolean;
	initialized: boolean;
	printInterval: IntervalID;
	status: {
		importId: number,
		siteId: number,
		status: string,
		filesTotal: number,
		filesProcessed: number,
	};

	// Spinnerz go brrrr
	runningSprite: RunningSprite;

	// This gets printed before the step status
	prefix: string;

	// This gets printed after the step status
	suffix: string;

	constructor( status: Object[] ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this.status = Object.assign( {}, status );
		this.prefix = '';
		this.suffix = '';
	}

	setStatus( status: Object ) {
		if ( 'FAILED' === status.status ) {
			this.hasFailure = true;
		}
		this.status = Object.assign( {}, status );
	}

	startPrinting( prePrintCallback: Function = () => {} ) {
		this.printInterval = setInterval( () => {
			prePrintCallback();
			this.print();
		}, PRINT_INTERVAL );
	}

	stopPrinting() {
		if ( this.printInterval ) {
			clearInterval( this.printInterval );
		}
	}

	print( { clearAfter = false }: { clearAfter?: boolean } = {} ) {
		if ( ! this.hasPrinted ) {
			this.hasPrinted = true;
			singleLogLine.clear();
		}

		const statusIcon = getGlyphForStatus( this.status.status, this.runningSprite );
		let logs;
		if ( this.status.filesProcessed && this.status.filesTotal ) {
			const progressPercentage = Math.floor( this.status.filesProcessed / this.status.filesTotal * 100 );
			logs = `Imported Files: ${ this.status.filesProcessed }/${ this.status.filesTotal } - ${ progressPercentage }% ${ statusIcon }`;
		}

		// Output the logs
		singleLogLine( `${ this.prefix || '' }${ logs || '' }${ this.suffix || '' }` );

		if ( clearAfter ) {
			// Break out of the "Single log line" buffer
			singleLogLine.clear();
		}
	}
}
