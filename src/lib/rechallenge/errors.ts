import { RECHALLENGE_VERSION } from './types';

import type { RechallengeStatus } from './types';

export class RechallengeError extends Error {
	public readonly scope: string;
	constructor( message: string, scope: string ) {
		super( message );
		this.name = 'RechallengeError';
		this.scope = scope;
	}
}

export class RechallengeUnsupportedVersionError extends RechallengeError {
	constructor( version: string, scope: string ) {
		super(
			`Server requested rechallenge version "${ version }" but this CLI only supports ${ RECHALLENGE_VERSION }. Update vip-cli.`,
			scope
		);
		this.name = 'RechallengeUnsupportedVersionError';
	}
}

export class RechallengeTerminalError extends RechallengeError {
	public readonly status: RechallengeStatus;
	constructor( status: RechallengeStatus, scope: string, detail?: string ) {
		super(
			`Step-up verification did not complete (status=${ status })${
				detail ? `: ${ detail }` : ''
			}.`,
			scope
		);
		this.name = 'RechallengeTerminalError';
		this.status = status;
	}
}

export class RechallengeAbortedError extends RechallengeError {
	constructor( scope: string ) {
		super( 'Step-up verification was cancelled.', scope );
		this.name = 'RechallengeAbortedError';
	}
}

export class RechallengeHttpError extends RechallengeError {
	public readonly statusCode: number;
	public readonly bodyText: string;
	constructor( statusCode: number, bodyText: string, scope: string ) {
		super( `Step-up verification request failed (HTTP ${ statusCode }): ${ bodyText }`, scope );
		this.name = 'RechallengeHttpError';
		this.statusCode = statusCode;
		this.bodyText = bodyText;
	}
}

export class RechallengeInteractionRequiredError extends RechallengeError {
	constructor( scope: string ) {
		super(
			`Step-up verification is required for ${ scope }, but this is a non-interactive session. ` +
				'Re-run the command interactively, or pass --rechallenge-wait (or set VIP_RECHALLENGE_WAIT=1) ' +
				'to print the verification URL and wait for you to complete it on another device.',
			scope
		);
		this.name = 'RechallengeInteractionRequiredError';
	}
}
