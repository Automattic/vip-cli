// @format

/**
 * External dependencies
 */
import { stdout as singleLogLine } from 'single-line-log';

/**
 * Internal dependencies
 */
import { getGlyphForStatus, RunningSprite } from '../../lib/cli/format';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.
const COMPLETED_STEP_SLUGS = [ 'success', 'skipped' ];

interface Step extends Record< string, string > {
	id: string;
	name: string;
}

interface StepFromServer {
	name: string;
	status: string;
}

export class ProgressTracker {
	hasFailure: boolean;
	hasPrinted: boolean;
	printInterval: NodeJS.Timer | undefined;

	// Track the state of each step
	stepsFromCaller: Map< string, Step >;
	stepsFromServer: Map< string, Step >;

	// Spinnerz go brrrr
	runningSprite: RunningSprite;

	// This gets printed before the step status
	prefix: string;

	// This gets printed after the step status
	suffix: string;

	constructor( steps: Step[] ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this.hasPrinted = false;
		this.stepsFromCaller = this.mapSteps( steps );
		this.stepsFromServer = new Map();
		this.prefix = '';
		this.suffix = '';
	}

	getSteps(): Map< string, Step > {
		return new Map( [ ...this.stepsFromCaller, ...this.stepsFromServer ] );
	}

	mapSteps( steps: Step[] ): Map< string, Step > {
		return steps.reduce( ( map, { id, name, status } ) => {
			map.set( id, { id, name, status: status || 'pending' } );
			return map;
		}, new Map< string, Step >() );
	}

	setUploadPercentage( percentage: string ) {
		const uploadStep = this.stepsFromCaller.get( 'upload' );
		if ( ! uploadStep ) {
			return;
		}
		this.stepsFromCaller.set( 'upload', { ...uploadStep, percentage } );
	}

	setProgress( progress: string ) {
		const step = this.getCurrentStep();
		if ( ! step ) {
			return;
		}

		this.stepsFromCaller.set( step.id, { ...step, progress } );
	}

	setStepsFromServer( steps: StepFromServer[] ) {
		const formattedSteps: Step[] = steps.map( ( { name, status }, index ) => ( {
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

	getNextStep(): Step | undefined {
		if ( this.allStepsSucceeded() ) {
			return undefined;
		}
		const steps = [ ...this.getSteps().values() ];
		return steps.find( ( { status } ) => status === 'pending' );
	}

	getCurrentStep(): Step | undefined {
		if ( this.allStepsSucceeded() ) {
			return undefined;
		}

		const steps = [ ...this.getSteps().values() ];
		return steps.find( ( { status } ) => status === 'running' );
	}

	stepRunning( stepId: string ): void {
		this.setStatusForStepId( stepId, 'running' );
	}

	stepFailed( stepId: string ): void {
		this.setStatusForStepId( stepId, 'failed' );
	}

	stepSkipped( stepId: string ): void {
		this.setStatusForStepId( stepId, 'skipped' );
	}

	stepSuccess( stepId: string ) {
		this.setStatusForStepId( stepId, 'success' );
		// The stepSuccess helper automatically sets the next step to "running"
		const nextStep = this.getNextStep();
		if ( nextStep ) {
			this.stepRunning( nextStep.id );
		}
	}

	allStepsSucceeded(): boolean {
		return [ ...this.getSteps().values() ].every( ( { status } ) => status === 'success' );
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

	startPrinting( prePrintCallback: () => unknown = () => {} ): void {
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
		const stepValues = [ ...this.getSteps().values() ];
		const logs = stepValues.reduce( ( accumulator, { name, id, percentage, status, progress } ) => {
			const statusIcon = getGlyphForStatus( status, this.runningSprite );
			let suffix = '';
			if ( id === 'upload' ) {
				if ( status === 'running' && percentage ) {
					suffix = percentage;
				}
			} else if ( progress ) {
				suffix = progress;
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
