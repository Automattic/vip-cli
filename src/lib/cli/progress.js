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

const COMPLETED_STEP_SLUGS = [ 'success', 'skipped' ];

export class ProgressTracker {
	allStepsSucceeded: boolean
	hasFailure: boolean
	hasPrinted: boolean
	initialized: boolean
	settingStepsFromServer: boolean

	// What kind of progress this instance is tracking
	type: string

	// Track the state of each step
	steps: Map<string, Object>

	// Spinnerz go brrrr
	runningSprite: RunningSprite

	prefix: string
	suffix: string

	constructor( steps: Object[] ) {
		this.runningSprite = new RunningSprite();
		this.hasFailure = false;
		this._setSteps( steps );
		this.prefix = '';
		this.suffix = '';
	}

	_setSteps( steps: Object[] ) {
		this.steps = steps.reduce( ( map, { id, name, status } ) => {
			map.set( id, { id, name, status: status || 'pending' } );
			return map;
		}, this.steps || new Map() );
	}

	setStepsFromServer( stepsFromServer: Object[] ) {
		this.settingStepsFromServer = true;
		this._setSteps( stepsFromServer.map( ( { name, status }, index ) => ( {
			id: `${ index }-${ name }`,
			name,
			status,
		} ) ) );
		this.settingStepsFromServer = false;
		this.print();
	}

	getNextStep() {
		if ( this.allStepsSucceeded ) {
			return undefined;
		}
		const steps = [ ...this.steps.values() ];
		return steps.find( ( { status } ) => status === 'pending' );
	}

	stepRunning( stepId: string ) {
		this.setStatusForStepId( stepId, 'running' );
		this.print();
	}

	stepFailed( stepId: string ) {
		this.setStatusForStepId( stepId, 'failed' );
		this.print( { clearAfter: true } );
	}

	stepSkipped( stepId: string ) {
		this.setStatusForStepId( stepId, 'skipped' );
		this.print();
	}

	stepSuccess( stepId: string ) {
		this.setStatusForStepId( stepId, 'success' );
		// The stepSuccess helper automatically sets the next step to "running"
		const nextStep = this.getNextStep();
		if ( nextStep ) {
			this.stepRunning( nextStep.id );
			return;
		}
		this.allStepsSucceeded = true;
		this.print( { clearAfter: true } );
	}

	setStatusForStepId( stepId: string, status: string, fromServer: boolean = false ) {
		const step = this.steps.get( stepId ) || {};
		const currentStatus = step?.status;
		if ( ! fromServer && ! currentStatus ) {
			// If we're not setting steps from the server, only the initial steps are allowed
			throw new Error( `Step name ${ stepId } is not valid for type ${ this.type }` );
		}

		if ( ! fromServer && COMPLETED_STEP_SLUGS.includes( step.status ) ) {
			throw new Error( `Step name ${ stepId } is already completed for type ${ this.type }` );
		}

		if ( status === 'failed' ) {
			this.hasFailure = true;
		}

		this.steps.set( stepId, {
			...step,
			status,
		} );

		if ( ! fromServer ) {
			this.print();
		}
	}

	print( { clearAfter = false }: { clearAfter?: boolean } = {} ) {
		if ( this.settingStepsFromServer ) {
			return;
		}
		if ( ! this.hasPrinted ) {
			this.hasPrinted = true;
			singleLogLine.clear();
		}
		const stepValues = [ ...this.steps.values() ];
		const logs = stepValues.reduce( ( accumulator, { name, status } ) => {
			const statusIcon = getGlyphForStatus( status, this.runningSprite );
			return `${ accumulator }${ statusIcon } ${ name }\n`;
		}, '' );

		// Output the logs
		singleLogLine( `${ this.prefix || '' }${ logs }${ this.suffix || '' }` );

		if ( clearAfter ) {
			// Break out of the "Single log line" buffer
			singleLogLine.clear();
		}
	}
}
