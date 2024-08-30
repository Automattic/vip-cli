import { stdout as singleLogLine } from 'single-line-log';

import { AppEnvironmentMediaImportStatus } from '../../graphqlTypes';
import { RunningSprite } from '../../lib/cli/format';
import { getGlyphForStatus } from '../../lib/media-import/status';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.

type MediaImportStatus = Pick<
	AppEnvironmentMediaImportStatus,
	'importId' | 'siteId' | 'status' | 'filesTotal' | 'filesProcessed'
>;

export class MediaImportProgressTracker {
	public hasFailure: boolean;
	public hasPrinted: boolean;
	public printInterval: NodeJS.Timeout | undefined;
	public status: MediaImportStatus;

	// Spinnerz go brrrr
	public runningSprite: RunningSprite;

	// This gets printed before the step status
	public prefix: string;

	// This gets printed after the step status
	public suffix: string;

	constructor( status: MediaImportStatus ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this.status = { ...status };
		this.prefix = '';
		this.suffix = '';
		this.hasPrinted = false;
	}

	public setStatus( status: MediaImportStatus ) {
		if ( 'FAILED' === status.status ) {
			this.hasFailure = true;
		}
		this.status = { ...status };
	}

	public startPrinting( prePrintCallback = (): void => {} ): void {
		this.printInterval = setInterval( () => {
			prePrintCallback();
			this.print();
		}, PRINT_INTERVAL );
	}

	public stopPrinting(): void {
		if ( this.printInterval ) {
			clearInterval( this.printInterval );
		}
	}

	public print( { clearAfter = false }: { clearAfter?: boolean } = {} ): void {
		if ( ! this.hasPrinted ) {
			this.hasPrinted = true;
			singleLogLine.clear();
		}

		const statusIcon = getGlyphForStatus( this.status.status ?? '', this.runningSprite );
		let logs;
		if ( typeof this.status.filesProcessed === 'number' && this.status.filesTotal ) {
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
