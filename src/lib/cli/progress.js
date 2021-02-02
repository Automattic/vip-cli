// @flow
/** @format */

/**
 * External dependencies
 */
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import { getGlyphForStatus, RunningSprite } from 'lib/cli/format';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.
const COMPLETED_STEP_SLUGS = [ 'success', 'skipped' ];

export class ProgressTracker {
	hasFailure: boolean;
	hasPrinted: boolean;
	initialized: boolean;
	printInterval: IntervalID;

	// Track the state of each step
	stepsFromCaller: Map<string, Object>;
	stepsFromServer: Map<string, Object>;

	// Spinnerz go brrrr
	runningSprite: RunningSprite;

	// This gets printed before the step status
	prefix: string;

	// This gets printed after the step status
	suffix: string;

	constructor( steps: Object[] ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this.stepsFromCaller = this.mapSteps( steps );
		this.stepsFromServer = new Map();
		this.prefix = '';
		this.suffix = '';
	}

	getSteps(): Map<string, Object> {
		return new Map( [ ...this.stepsFromCaller, ...this.stepsFromServer ] );
	}

	mapSteps( steps: Object[] ): Map<string, Object> {
		return steps.reduce( ( map, { id, name, status } ) => {
			map.set( id, { id, name, status: status || 'pending' } );
			return map;
		}, new Map() );
	}

	setUploadPercentage( percentage: string ) {
		const uploadStep = this.stepsFromCaller.get( 'upload' );
		if ( ! uploadStep ) {
			return;
		}
		this.stepsFromCaller.set( 'upload', { ...uploadStep, percentage } );
	}

	setStepsFromServer( steps: Object[] ) {
		const formattedSteps = steps.map( ( { name, status }, index ) => ( {
			id: `server-${ index }-${ name }`,
			name,
			status,
		} ) );

		if ( ! steps.some( ( { status } ) => status === 'running' ) ) {
			const firstPendingStepIndex = steps.findIndex( ( { status } ) => status === 'pending' );

			if ( firstPendingStepIndex !== -1 ) {
				// "Promote" the first "pending" to "running"
				formattedSteps[ firstPendingStepIndex ].status = 'running';
			}
		}

		this.stepsFromServer = this.mapSteps( formattedSteps );
	}

	getNextStep() {
		if ( this.allStepsSucceeded() ) {
			return undefined;
		}
		const steps = [ ...this.getSteps().values() ];
		return steps.find( ( { status } ) => status === 'pending' );
	}

	stepRunning( stepId: string ) {
		this.setStatusForStepId( stepId, 'running' );
	}

	stepFailed( stepId: string ) {
		this.setStatusForStepId( stepId, 'failed' );
	}

	stepSkipped( stepId: string ) {
		this.setStatusForStepId( stepId, 'skipped' );
	}

	stepSuccess( stepId: string ) {
		this.setStatusForStepId( stepId, 'success' );
		// The stepSuccess helper automatically sets the next step to "running"
		const nextStep = this.getNextStep();
		if ( nextStep ) {
			this.stepRunning( nextStep.id );
			return;
		}
	}

	allStepsSucceeded() {
		return ! [ ...this.getSteps().values() ].some( ( { status } ) => status !== 'success' );
	}

	setStatusForStepId( stepId: string, status: string ) {
		const step = this.stepsFromCaller.get( stepId );
		if ( ! step ) {
			// Only allowed to update existing steps with this method
			throw new Error( `Step name ${ stepId } is not valid.` );
		}

		if ( COMPLETED_STEP_SLUGS.includes( step.status ) ) {
			throw new Error( `Step name ${ stepId } is already completed.` );
		}

		if ( status === 'failed' ) {
			this.hasFailure = true;
		}

		this.stepsFromCaller.set( stepId, {
			...step,
			status,
		} );
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
		const stepValues = [ ...this.getSteps().values() ];
		const logs = stepValues.reduce( ( accumulator, { name, id, percentage, status } ) => {
			const statusIcon = getGlyphForStatus( status, this.runningSprite );
			let suffix = '';
			if ( id === 'upload' ) {
				if ( status === 'running' && percentage ) {
					suffix = percentage;
				}
			}
			return `${ accumulator }${ statusIcon } ${ name } ${ suffix }\n`;
		}, '' );

		// Output the logs
		singleLogLine( `${ this.prefix || '' }${ logs }${ this.suffix || '' }` );

		if ( clearAfter ) {
			// Break out of the "Single log line" buffer
			singleLogLine.clear();
		}
	}
}
