import chalk from 'chalk';
import debugLib from 'debug';
import { setTimeout as sleep } from 'node:timers/promises';

import { trackEvent } from '../tracker';
import * as client from './client';
import {
	RechallengeAbortedError,
	RechallengeInteractionRequiredError,
	RechallengeTerminalError,
	RechallengeUnsupportedVersionError,
} from './errors';
import { openBrowser } from './open-browser';
import tokenCache from './token-cache';
import { CLIENT_TYPE, RECHALLENGE_VERSION } from './types';

import type { ElevatedToken, RechallengeExtension, RechallengeStatus } from './types';

const debug = debugLib( '@automattic/vip:rechallenge:flow' );

// Floor for the server-provided poll interval. Guards against a missing/0/NaN
// value (which would otherwise produce a tight status-poll loop) and clamps
// implausibly small values so a misbehaving server cannot make us hammer the API.
const MIN_POLL_INTERVAL_SECONDS = 2;

const TERMINAL: ReadonlySet< RechallengeStatus > = new Set( [
	'verified',
	'expired',
	'failed',
	'cancelled',
] );

export interface RunRechallengeOptions {
	requestedOperation: string;
	rechallenge: RechallengeExtension;
	interactive: boolean;
	wait: boolean;
	signal?: AbortSignal;
}

export async function runRechallenge( opts: RunRechallengeOptions ): Promise< ElevatedToken > {
	const { requestedOperation, rechallenge, interactive, wait, signal } = opts;

	if ( rechallenge.version !== RECHALLENGE_VERSION ) {
		throw new RechallengeUnsupportedVersionError( rechallenge.version, requestedOperation );
	}

	await trackEvent( 'rechallenge_required', {
		scope: requestedOperation,
		clientType: CLIENT_TYPE,
	} );

	// In a non-interactive session with no opt-in to wait, fail fast instead of
	// creating a verification session no human can complete — automation would
	// otherwise block until the session expires.
	if ( ! interactive && ! wait ) {
		await trackEvent( 'rechallenge_interaction_required', { scope: requestedOperation } );
		throw new RechallengeInteractionRequiredError( requestedOperation );
	}

	const session = await client.createSession( {
		path: rechallenge.createSessionPath,
		requestedOperation,
	} );
	await trackEvent( 'rechallenge_session_created', { scope: requestedOperation } );

	const verificationUrl = session.verificationUrl;
	const expiresIso = session.expiresAt;
	if ( interactive ) {
		await openBrowser( verificationUrl );
		console.warn(
			chalk.yellow( '⚠' ),
			`Step-up verification required for ${ chalk.bold( requestedOperation ) }.`
		);
		console.warn( `  Opened ${ chalk.cyan( verificationUrl ) }` );
		console.warn(
			`  If your browser did not open, copy and paste the URL above. Expires at ${ expiresIso }.`
		);
	} else {
		console.warn(
			`Step-up verification required for ${ requestedOperation }. ` +
				`Complete it at: ${ verificationUrl } (expires at ${ expiresIso }).`
		);
	}

	const requestedInterval = Number( session.pollIntervalSeconds );
	const interval =
		Math.max(
			Number.isFinite( requestedInterval ) ? requestedInterval : MIN_POLL_INTERVAL_SECONDS,
			MIN_POLL_INTERVAL_SECONDS
		) * 1000;
	const deadline = Date.parse( session.expiresAt );
	if ( Number.isNaN( deadline ) ) {
		throw new RechallengeTerminalError(
			'expired',
			requestedOperation,
			'server returned unparseable expiresAt'
		);
	}

	/* eslint-disable no-await-in-loop -- polling loop; each iteration must complete before the next */
	while ( true ) {
		if ( signal?.aborted ) {
			throw new RechallengeAbortedError( requestedOperation );
		}

		try {
			await sleep( interval, undefined, { signal } );
		} catch {
			throw new RechallengeAbortedError( requestedOperation );
		}

		if ( ! Number.isNaN( deadline ) && Date.now() > deadline ) {
			throw new RechallengeTerminalError(
				'expired',
				requestedOperation,
				'session window elapsed before completion'
			);
		}

		const status = await client.getSessionStatus( {
			template: rechallenge.statusPathTemplate,
			challengeId: session.challengeId,
			scope: requestedOperation,
		} );

		if ( ! TERMINAL.has( status.status ) ) {
			debug( 'still %s; polling again', status.status );
			continue;
		}

		if ( status.status === 'verified' ) {
			await trackEvent( 'rechallenge_verified', {
				scope: requestedOperation,
				provider: status.provider ?? 'unknown',
			} );
			const { elevatedToken } = await client.exchange( {
				template: rechallenge.exchangePathTemplate,
				challengeId: session.challengeId,
				scope: requestedOperation,
			} );
			await trackEvent( 'rechallenge_exchanged', { scope: requestedOperation } );
			await tokenCache.set( requestedOperation, {
				...elevatedToken,
				headerName: rechallenge.elevatedHeaderName,
			} );
			return elevatedToken;
		}

		await trackEvent( `rechallenge_${ status.status }`, {
			scope: requestedOperation,
		} );
		throw new RechallengeTerminalError(
			status.status,
			requestedOperation,
			status.statusReason?.message
		);
	}
	/* eslint-enable no-await-in-loop */
}

export function isInteractiveContext( argvOrFlags: string[] = process.argv ): boolean {
	if ( process.env.VIP_NON_INTERACTIVE === '1' ) {
		return false;
	}

	if (
		argvOrFlags.some(
			item => item === '--non-interactive' || item.startsWith( '--non-interactive=' )
		)
	) {
		return false;
	}

	return Boolean( process.stdout.isTTY );
}

// Opt-in for waiting on step-up in a non-interactive session: the operator can
// complete browser verification on another device while the command polls.
// Mirrors isInteractiveContext's argv/env detection because the rechallenge link
// is instantiated globally and cannot read a command's parsed options.
export function shouldWaitForRechallenge( argvOrFlags: string[] = process.argv ): boolean {
	if ( process.env.VIP_RECHALLENGE_WAIT === '1' ) {
		return true;
	}

	return argvOrFlags.some(
		item => item === '--rechallenge-wait' || item.startsWith( '--rechallenge-wait=' )
	);
}
