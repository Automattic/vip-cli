import { EOL } from 'node:os';
import { stdout as singleLogLine } from 'single-line-log';

import { getGlyphForStatus, RunningSprite } from '../../lib/cli/format';

const PRINT_INTERVAL = process.env.DEBUG ? 5000 : 200; // How often the report is printed. Mainly affects the "spinner" animation.

export const enum StepStatus {
	PENDING = 'pending',
	RUNNING = 'running',
	SUCCESS = 'success',
	FAILED = 'failed',
	UNKNOWN = 'unknown',
	SKIPPED = 'skipped',
}

const COMPLETED_STEP_SLUGS = [ StepStatus.SUCCESS, StepStatus.SKIPPED ];

export interface Step {
	id: string;
	name: string;
	status: StepStatus;
	[ key: string ]: string;
}

export type StepConstructorParam = Omit< Step, 'status' > & { status?: StepStatus };

export interface StepFromServer {
	name: string;
	status: StepStatus;
}

export class ProgressTracker {
	hasFailure: boolean;
	hasPrinted: boolean;
	printInterval: NodeJS.Timeout | undefined;

	// Track the state of each step
	stepsFromCaller: Map< string, Step >;
	stepsFromServer: Map< string, Step >;

	// Spinnerz go brrrr
	runningSprite: RunningSprite;

	// This gets printed before the step status
	prefix: string;

	// This gets printed after the step status
	suffix: string;

	/**
	 * This determines from which step should we display the steps
	 *
	 * Useful when you want to display a prompt.
	 *
	 * And we don't want to repeatedly display the steps that has finished.
	 */
	displayFromStep = 0;

	constructor( steps: StepConstructorParam[] ) {
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

	mapSteps( steps: StepConstructorParam[] ): Map< string, Step > {
		return steps.reduce( ( map, { id, name, status } ) => {
			map.set( id, { id, name, status: status ?? StepStatus.PENDING } );
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

		if ( ! steps.some( ( { status } ) => status === StepStatus.RUNNING ) ) {
			const firstPendingStepIndex = steps.findIndex(
				( { status } ) => status === StepStatus.PENDING
			);

			if ( firstPendingStepIndex !== -1 ) {
				// "Promote" the first "pending" to "running"
				formattedSteps[ firstPendingStepIndex ].status = StepStatus.RUNNING;
			}
		}

		this.stepsFromServer = this.mapSteps( formattedSteps );
	}

	getNextStep(): Step | undefined {
		if ( this.allStepsSucceeded() ) {
			return undefined;
		}
		const steps = [ ...this.getSteps().values() ];
		return steps.find( ( { status } ) => status === StepStatus.PENDING );
	}

	getCurrentStep(): Step | undefined {
		if ( this.allStepsSucceeded() ) {
			return undefined;
		}

		const steps = [ ...this.getSteps().values() ];
		return steps.find( ( { status } ) => status === StepStatus.RUNNING );
	}

	stepRunning( stepId: string ): void {
		this.setStatusForStepId( stepId, StepStatus.RUNNING );
	}

	stepFailed( stepId: string ): void {
		this.setStatusForStepId( stepId, StepStatus.FAILED );
	}

	stepSkipped( stepId: string ): void {
		this.setStatusForStepId( stepId, StepStatus.SKIPPED );
	}

	stepSuccess( stepId: string ) {
		this.setStatusForStepId( stepId, StepStatus.SUCCESS );
		// The stepSuccess helper automatically sets the next step to "running"
		const nextStep = this.getNextStep();
		if ( nextStep ) {
			this.stepRunning( nextStep.id );
		}
	}

	allStepsSucceeded(): boolean {
		return [ ...this.getSteps().values() ].every( ( { status } ) => status === StepStatus.SUCCESS );
	}

	setStatusForStepId( stepId: string, status: StepStatus ) {
		const step = this.stepsFromCaller.get( stepId );
		if ( ! step ) {
			// Only allowed to update existing steps with this method
			throw new Error( `Step name ${ stepId } is not valid.` );
		}

		if ( COMPLETED_STEP_SLUGS.includes( step.status ) ) {
			throw new Error( `Step name ${ stepId } is already completed.` );
		}

		if ( status === StepStatus.FAILED ) {
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

	async handleContinuePrompt< PromptReturn >(
		prompt: ( setPromptShown: () => void ) => Promise< PromptReturn >
	): Promise< PromptReturn > {
		this.print();
		this.stopPrinting();

		let isPromptShown = false;

		const setPromptShown = () => {
			isPromptShown = true;
		};

		const returnValue = await prompt( setPromptShown );

		if ( isPromptShown ) {
			this.displayFromStep = [ ...this.getSteps().values() ].findIndex(
				step => step.status === StepStatus.RUNNING
			);
		}
		let hasPrintedOnce = false;

		const printingStartedPromise = new Promise< void >( resolve => {
			this.startPrinting( () => {
				if ( hasPrintedOnce ) {
					return;
				}

				// this is so that we leave some room for the progress tracker to refresh
				// without this, any prompt, or any text in between will get overwritten by the progress tracker
				let linesToSkip = '';

				for ( let iteration = 0; iteration < this.stepsFromCaller.size; iteration++ ) {
					linesToSkip += EOL;
				}

				if ( isPromptShown ) {
					process.stdout.write( linesToSkip );
				}

				hasPrintedOnce = true;

				resolve();
			} );
		} );

		await printingStartedPromise;

		return returnValue;
	}

	print( { clearAfter = false }: { clearAfter?: boolean } = {} ): void {
		if ( ! this.hasPrinted ) {
			this.hasPrinted = true;
			singleLogLine.clear();
		}
		const stepValues = [ ...this.getSteps().values() ];
		const logs = stepValues.reduce(
			( accumulator, { name, id, percentage, status, progress }, stepNumber ) => {
				if ( stepNumber < this.displayFromStep ) {
					return accumulator;
				}

				const statusIcon = getGlyphForStatus( status, this.runningSprite );
				let suffix = '';
				if ( id === 'upload' ) {
					if ( status === StepStatus.RUNNING && percentage ) {
						suffix = percentage;
					}
				} else if ( progress ) {
					suffix = progress;
				}
				return `${ accumulator }${ statusIcon } ${ name } ${ suffix }\n`;
			},
			''
		);

		// Output the logs
		singleLogLine( `${ this.prefix || '' }${ logs }${ this.suffix || '' }` );

		if ( clearAfter ) {
			// Break out of the "Single log line" buffer
			singleLogLine.clear();
		}
	}
}
