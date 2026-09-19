import UserError from '../user-error';
import { escapeTerminalText } from './output';

export interface ProductionMutationConfirmationRequest {
	action: 'deploy' | 'enable';
	appName: string;
	envType: string;
	workerNames: readonly string[];
	enableAfterDeploy: boolean;
	skipConfirmation: boolean;
	nonInteractive: boolean;
}

export interface EdgeWorkerDeletionConfirmationRequest {
	appName: string;
	envType: string;
	workerName: string;
	force: boolean;
}

export type EdgeWorkerConfirmFunction = ( message: string ) => Promise< boolean >;

export function isInteractiveEdgeWorkers( options: { nonInteractive?: boolean } ): boolean {
	return (
		process.env.VIP_NON_INTERACTIVE !== '1' &&
		! options.nonInteractive &&
		Boolean( process.stdout.isTTY )
	);
}

function productionMutationConfirmationMessage(
	request: ProductionMutationConfirmationRequest
): string {
	const target = `${ escapeTerminalText( request.appName ) }.${ escapeTerminalText(
		request.envType
	) }`;
	if ( request.action === 'enable' ) {
		return `Enable edge worker "${ escapeTerminalText(
			request.workerNames[ 0 ]
		) }" on ${ target }?`;
	}

	const action = request.enableAfterDeploy ? 'Deploy and enable' : 'Deploy';
	const workerLabel = request.workerNames.length === 1 ? 'edge worker' : 'edge workers';
	const preposition = request.enableAfterDeploy ? 'on' : 'to';
	const workerNames = request.workerNames.map( escapeTerminalText ).join( ', ' );

	return `${ action } ${ request.workerNames.length } ${ workerLabel } (${ workerNames }) ${ preposition } ${ target }?`;
}

export async function confirmProductionEdgeWorkerMutation(
	request: ProductionMutationConfirmationRequest,
	confirmFn: EdgeWorkerConfirmFunction
): Promise< void > {
	if ( request.envType !== 'production' || request.skipConfirmation ) {
		return;
	}

	if ( request.nonInteractive ) {
		const action =
			request.action === 'deploy' && request.enableAfterDeploy
				? 'deploy and enable'
				: request.action;
		throw new UserError(
			`Refusing to ${ action } edge workers in production without confirmation. ` +
				'Pass --skip-confirmation to proceed non-interactively.'
		);
	}

	const message = productionMutationConfirmationMessage( request );

	if ( ! ( await confirmFn( message ) ) ) {
		throw new UserError( 'Command cancelled by user.' );
	}
}

export async function confirmEdgeWorkerDeletion(
	request: EdgeWorkerDeletionConfirmationRequest,
	confirmFn: EdgeWorkerConfirmFunction
): Promise< void > {
	if ( request.force ) {
		return;
	}

	const confirmed = await confirmFn(
		`Permanently delete edge worker "${ escapeTerminalText(
			request.workerName
		) }" from ${ escapeTerminalText( request.appName ) }.${ escapeTerminalText(
			request.envType
		) }?`
	);
	if ( ! confirmed ) {
		throw new UserError( 'Command cancelled by user.' );
	}
}
