import { afterEach, describe, expect, it, jest, beforeEach } from '@jest/globals';

import * as clientModule from '../../../src/lib/rechallenge/client';
import {
	RechallengeAbortedError,
	RechallengeTerminalError,
	RechallengeUnsupportedVersionError,
} from '../../../src/lib/rechallenge/errors';
import { isInteractiveContext, runRechallenge } from '../../../src/lib/rechallenge/flow';
import * as openBrowserModule from '../../../src/lib/rechallenge/open-browser';
import tokenCache from '../../../src/lib/rechallenge/token-cache';

import type { RechallengeExtension } from '../../../src/lib/rechallenge/types';

jest.mock( '../../../src/lib/rechallenge/client' );
jest.mock( '../../../src/lib/rechallenge/token-cache', () => ( {
	__esModule: true,
	default: {
		get: jest.fn(),
		set: jest.fn( () => Promise.resolve() ),
		clearScope: jest.fn(),
		clearAll: jest.fn(),
	},
} ) );
jest.mock( '../../../src/lib/rechallenge/open-browser', () => ( {
	openBrowser: jest.fn( () => Promise.resolve() ),
} ) );
jest.mock( '../../../src/lib/tracker', () => ( {
	trackEvent: jest.fn( () => Promise.resolve() ),
} ) );

const mockCreate = clientModule.createSession as jest.MockedFunction<
	typeof clientModule.createSession
>;
const mockGetStatus = clientModule.getSessionStatus as jest.MockedFunction<
	typeof clientModule.getSessionStatus
>;
const mockExchange = clientModule.exchange as jest.MockedFunction< typeof clientModule.exchange >;
const mockSet = tokenCache.set as unknown as jest.Mock;
const mockOpenBrowser = openBrowserModule.openBrowser as jest.Mock;

function rechallenge(): RechallengeExtension {
	return {
		version: 'v2',
		createSessionPath: '/rechallenge/v2/sessions',
		statusPathTemplate: '/rechallenge/v2/sessions/{challengeId}',
		exchangePathTemplate: '/rechallenge/v2/sessions/{challengeId}/exchange',
		elevatedHeaderName: 'x-elevated-token',
	};
}

beforeEach( () => {
	jest.clearAllMocks();
	mockCreate.mockResolvedValue( {
		challengeId: 'rch_abc',
		status: 'pending',
		verificationUrl: 'https://example.com/verify',
		pollIntervalSeconds: 0, // tight loop for tests
		expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
	} );
	mockExchange.mockResolvedValue( {
		elevatedToken: {
			token: 'jwt.payload.sig',
			expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
			purpose: 'validate-elevated-permissions',
		},
	} );
} );

describe( 'runRechallenge', () => {
	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'rejects v1 with RechallengeUnsupportedVersionError', async () => {
		await expect(
			runRechallenge( {
				requestedOperation: 'updateDefensiveModeStatus',
				rechallenge: { ...rechallenge(), version: 'v1' },
				interactive: false,
			} )
		).rejects.toBeInstanceOf( RechallengeUnsupportedVersionError );
	} );

	it( 'polls until verified then exchanges and caches the token', async () => {
		mockGetStatus
			.mockResolvedValueOnce( {
				challengeId: 'rch_abc',
				status: 'pending',
				expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
				pollIntervalSeconds: 0,
			} )
			.mockResolvedValueOnce( {
				challengeId: 'rch_abc',
				status: 'verified',
				expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
				pollIntervalSeconds: 0,
				provider: 'passkeys',
			} );

		jest.useFakeTimers();
		const pending = runRechallenge( {
			requestedOperation: 'updateDefensiveModeStatus',
			rechallenge: rechallenge(),
			interactive: false,
		} );
		await jest.runAllTimersAsync();
		const token = await pending;

		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { trackEvent } = require( '../../../src/lib/tracker' ) as { trackEvent: jest.Mock };
		expect( token.token ).toBe( 'jwt.payload.sig' );
		expect( mockGetStatus ).toHaveBeenCalledTimes( 2 );
		expect( mockExchange ).toHaveBeenCalledTimes( 1 );
		expect( mockSet ).toHaveBeenCalledWith(
			'updateDefensiveModeStatus',
			expect.objectContaining( { token: 'jwt.payload.sig' } )
		);
		expect( trackEvent ).toHaveBeenCalledWith(
			'rechallenge_verified',
			expect.objectContaining( { scope: 'updateDefensiveModeStatus' } )
		);
		expect( trackEvent ).toHaveBeenCalledWith(
			'rechallenge_exchanged',
			expect.objectContaining( { scope: 'updateDefensiveModeStatus' } )
		);
		// verified fires before exchanged
		const calls = trackEvent.mock.calls.map( ( [ name ] ) => name );
		expect( calls.indexOf( 'rechallenge_verified' ) ).toBeLessThan(
			calls.indexOf( 'rechallenge_exchanged' )
		);
	} );

	it( 'throws RechallengeTerminalError on non-verified terminal states', async () => {
		mockGetStatus.mockResolvedValueOnce( {
			challengeId: 'rch_abc',
			status: 'expired',
			expiresAt: new Date( Date.now() - 1 ).toISOString(),
			pollIntervalSeconds: 0,
			statusReason: { code: 'expired', message: 'session expired' },
		} );

		jest.useFakeTimers();
		const pending = runRechallenge( {
			requestedOperation: 'updateDefensiveModeStatus',
			rechallenge: rechallenge(),
			interactive: false,
		} );
		await Promise.all( [
			expect( pending ).rejects.toBeInstanceOf( RechallengeTerminalError ),
			jest.runAllTimersAsync(),
		] );
	} );

	it( 'aborts when the abort signal fires', async () => {
		const ac = new AbortController();
		mockGetStatus.mockImplementation(
			() =>
				new Promise( resolve => {
					setTimeout(
						() =>
							resolve( {
								challengeId: 'rch_abc',
								status: 'pending',
								expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
								pollIntervalSeconds: 0,
							} ),
						5
					);
				} )
		);

		const pending = runRechallenge( {
			requestedOperation: 'updateDefensiveModeStatus',
			rechallenge: rechallenge(),
			interactive: false,
			signal: ac.signal,
		} );
		setTimeout( () => ac.abort(), 10 );

		await expect( pending ).rejects.toBeInstanceOf( RechallengeAbortedError );
	} );

	it( 'does not call open() when interactive=false', async () => {
		mockGetStatus.mockResolvedValueOnce( {
			challengeId: 'rch_abc',
			status: 'verified',
			expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
			pollIntervalSeconds: 0,
		} );
		jest.useFakeTimers();
		const pending = runRechallenge( {
			requestedOperation: 'updateDefensiveModeStatus',
			rechallenge: rechallenge(),
			interactive: false,
		} );
		await jest.runAllTimersAsync();
		await pending;
		expect( mockOpenBrowser ).not.toHaveBeenCalled();
	} );

	it( 'calls open() with verificationUrl when interactive=true', async () => {
		mockGetStatus.mockResolvedValueOnce( {
			challengeId: 'rch_abc',
			status: 'verified',
			expiresAt: new Date( Date.now() + 60_000 ).toISOString(),
			pollIntervalSeconds: 0,
		} );
		jest.useFakeTimers();
		const pending = runRechallenge( {
			requestedOperation: 'updateDefensiveModeStatus',
			rechallenge: rechallenge(),
			interactive: true,
		} );
		await jest.runAllTimersAsync();
		await pending;
		expect( mockOpenBrowser ).toHaveBeenCalledWith( 'https://example.com/verify' );
	} );
} );

describe( 'isInteractiveContext', () => {
	const originalEnv = process.env.VIP_NON_INTERACTIVE;
	const originalIsTTY = process.stdout.isTTY;

	afterEach( () => {
		process.env.VIP_NON_INTERACTIVE = originalEnv;
		Object.defineProperty( process.stdout, 'isTTY', {
			value: originalIsTTY,
			configurable: true,
		} );
	} );

	it( 'returns false when VIP_NON_INTERACTIVE=1', () => {
		process.env.VIP_NON_INTERACTIVE = '1';
		Object.defineProperty( process.stdout, 'isTTY', {
			value: true,
			configurable: true,
		} );
		expect( isInteractiveContext( [] ) ).toBe( false );
	} );

	it( 'returns true for non-"1" values of VIP_NON_INTERACTIVE', () => {
		process.env.VIP_NON_INTERACTIVE = '0';
		Object.defineProperty( process.stdout, 'isTTY', {
			value: true,
			configurable: true,
		} );
		expect( isInteractiveContext( [] ) ).toBe( true );
	} );

	it( 'returns false when --non-interactive is in argv', () => {
		delete process.env.VIP_NON_INTERACTIVE;
		Object.defineProperty( process.stdout, 'isTTY', {
			value: true,
			configurable: true,
		} );
		expect( isInteractiveContext( [ '--non-interactive' ] ) ).toBe( false );
	} );

	it( 'returns false when stdout is not a TTY', () => {
		delete process.env.VIP_NON_INTERACTIVE;
		Object.defineProperty( process.stdout, 'isTTY', {
			value: false,
			configurable: true,
		} );
		expect( isInteractiveContext( [] ) ).toBe( false );
	} );

	it( 'returns true when TTY, no flag, no env var', () => {
		delete process.env.VIP_NON_INTERACTIVE;
		Object.defineProperty( process.stdout, 'isTTY', {
			value: true,
			configurable: true,
		} );
		expect( isInteractiveContext( [] ) ).toBe( true );
	} );
} );
