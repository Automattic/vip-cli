/**
 * External dependencies
 */
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import { getGlyphForStatus } from '../../lib/media-import/status';
import { RunningSprite } from '../../lib/cli/format';
import { AppEnvironmentMediaImportStatus } from '../../graphqlTypes';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.

type MediaImportStatus = Pick<
	AppEnvironmentMediaImportStatus,
	'importId' | 'siteId' | 'status' | 'filesTotal' | 'filesProcessed'
>;

export class MediaImportProgressTracker {
	hasFailure: boolean;
	hasPrinted: boolean;
	printInterval: NodeJS.Timer | undefined;
	status: MediaImportStatus;

	// Spinnerz go brrrr
	runningSprite: RunningSprite;

	// This gets printed before the step status
	prefix: string;

	// This gets printed after the step status
	suffix: string;

	constructor( status: MediaImportStatus ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this.status = { ...status };
		this.prefix = '';
		this.suffix = '';
		this.hasPrinted = false;
	}

	setStatus( status: MediaImportStatus ) {
		if ( 'FAILED' === status.status ) {
			this.hasFailure = true;
		}
		this.status = { ...status };
	}

	startPrinting( prePrintCallback = (): void => {} ): void {
		this.printInterval = setInterval( () => {
			prePrintCallback();
			this.print();
		}, PRINT_INTERVAL );
	}

	stopPrinting(): void {
		if ( this.printInterval ) {
			clearInterval( this.printInterval );
		}
	}

	print( { clearAfter = false }: { clearAfter?: boolean } = {} ): void {
		if ( ! this.hasPrinted ) {
			this.hasPrinted = true;
			singleLogLine.clear();
		}

		const statusIcon = getGlyphForStatus( this.status.status, this.runningSprite );
		let logs;
		if ( this.status.filesProcessed && this.status.filesTotal ) {
			const progressPercentage = Math.floor(
				( this.status.filesProcessed / this.status.filesTotal ) * 100
			);
			logs = `Imported Files: ${ this.status.filesProcessed }/${ this.status.filesTotal } - ${ progressPercentage }% ${ statusIcon }`;
		}

		// Output the logs
		singleLogLine( `${ this.prefix || '' }${ logs ?? '' }${ this.suffix || '' }` );

		if ( clearAfter ) {
			// Break out of the "Single log line" buffer
			singleLogLine.clear();
		}
	}
}
