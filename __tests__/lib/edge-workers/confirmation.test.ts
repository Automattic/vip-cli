import {
	confirmEdgeWorkerDeletion,
	confirmProductionEdgeWorkerMutation,
	isInteractiveEdgeWorkers,
} from '../../../src/lib/edge-workers/confirmation';
import UserError from '../../../src/lib/user-error';

const productionRequest = {
	action: 'deploy' as const,
	appName: 'example-app',
	envType: 'production',
	workerNames: [ 'headers', 'redirects' ],
	skipConfirmation: false,
	nonInteractive: false,
};

function withStdoutIsTTY< T >( isTTY: boolean, callback: () => T ): T {
	const originalDescriptor = Object.getOwnPropertyDescriptor( process, 'stdout' );
	const stdout = Object.create( process.stdout ) as NodeJS.WriteStream;
	Object.defineProperty( stdout, 'isTTY', {
		configurable: true,
		value: isTTY,
		writable: true,
	} );

	try {
		Object.defineProperty( process, 'stdout', {
			configurable: true,
			enumerable: originalDescriptor?.enumerable ?? true,
			value: stdout,
			writable: true,
		} );
		return callback();
	} finally {
		if ( originalDescriptor ) {
			Object.defineProperty( process, 'stdout', originalDescriptor );
		} else {
			delete ( process as { stdout?: NodeJS.WriteStream } ).stdout;
		}
	}
}

describe( 'isInteractiveEdgeWorkers()', () => {
	it( 'uses a TTY when no non-interactive override is set', () => {
		const originalEnv = process.env.VIP_NON_INTERACTIVE;

		try {
			delete process.env.VIP_NON_INTERACTIVE;
			withStdoutIsTTY( true, () => {
				expect( isInteractiveEdgeWorkers( {} ) ).toBe( true );
			} );
		} finally {
			if ( originalEnv === undefined ) {
				delete process.env.VIP_NON_INTERACTIVE;
			} else {
				process.env.VIP_NON_INTERACTIVE = originalEnv;
			}
		}
	} );

	it( 'treats VIP_NON_INTERACTIVE=1 as non-interactive', () => {
		const originalEnv = process.env.VIP_NON_INTERACTIVE;

		try {
			process.env.VIP_NON_INTERACTIVE = '1';
			withStdoutIsTTY( true, () => {
				expect( isInteractiveEdgeWorkers( {} ) ).toBe( false );
			} );
		} finally {
			if ( originalEnv === undefined ) {
				delete process.env.VIP_NON_INTERACTIVE;
			} else {
				process.env.VIP_NON_INTERACTIVE = originalEnv;
			}
		}
	} );

	it( 'treats an explicit nonInteractive option as non-interactive', () => {
		const originalEnv = process.env.VIP_NON_INTERACTIVE;

		try {
			delete process.env.VIP_NON_INTERACTIVE;
			withStdoutIsTTY( true, () => {
				expect( isInteractiveEdgeWorkers( { nonInteractive: true } ) ).toBe( false );
			} );
		} finally {
			if ( originalEnv === undefined ) {
				delete process.env.VIP_NON_INTERACTIVE;
			} else {
				process.env.VIP_NON_INTERACTIVE = originalEnv;
			}
		}
	} );

	it( 'treats non-TTY stdout as non-interactive', () => {
		const originalEnv = process.env.VIP_NON_INTERACTIVE;

		try {
			delete process.env.VIP_NON_INTERACTIVE;
			withStdoutIsTTY( false, () => {
				expect( isInteractiveEdgeWorkers( {} ) ).toBe( false );
			} );
		} finally {
			if ( originalEnv === undefined ) {
				delete process.env.VIP_NON_INTERACTIVE;
			} else {
				process.env.VIP_NON_INTERACTIVE = originalEnv;
			}
		}
	} );
} );

describe( 'confirmProductionEdgeWorkerMutation()', () => {
	it( 'prompts with every exact worker name for interactive production deploys', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >().mockResolvedValue( true );

		await confirmProductionEdgeWorkerMutation( productionRequest, confirmFn );

		expect( confirmFn ).toHaveBeenCalledWith(
			'Deploy 2 edge workers (headers, redirects) to example-app.production?'
		);
	} );

	it( 'prompts with the exact worker identity for interactive production enables', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >().mockResolvedValue( true );

		await confirmProductionEdgeWorkerMutation(
			{ ...productionRequest, action: 'enable', workerNames: [ 'headers' ] },
			confirmFn
		);

		expect( confirmFn ).toHaveBeenCalledWith(
			'Enable edge worker "headers" on example-app.production?'
		);
	} );

	it( 'rejects non-interactive production without bypass', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >();

		await expect(
			confirmProductionEdgeWorkerMutation(
				{ ...productionRequest, nonInteractive: true },
				confirmFn
			)
		).rejects.toThrow( /Refusing to deploy.*production/ );
		expect( confirmFn ).not.toHaveBeenCalled();
	} );

	it( 'throws UserError when the user declines', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >().mockResolvedValue( false );

		await expect(
			confirmProductionEdgeWorkerMutation( productionRequest, confirmFn )
		).rejects.toEqual( new UserError( 'Command cancelled by user.' ) );
	} );

	it( 'skips prompting when bypassed', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >();

		await confirmProductionEdgeWorkerMutation(
			{ ...productionRequest, skipConfirmation: true, nonInteractive: true },
			confirmFn
		);

		expect( confirmFn ).not.toHaveBeenCalled();
	} );

	it( 'does not prompt outside production', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >();

		await confirmProductionEdgeWorkerMutation(
			{ ...productionRequest, envType: 'develop', nonInteractive: true },
			confirmFn
		);

		expect( confirmFn ).not.toHaveBeenCalled();
	} );
} );

describe( 'confirmEdgeWorkerDeletion()', () => {
	const request = {
		appName: 'example-app',
		envType: 'production',
		workerName: 'headers',
		force: false,
	};

	it( 'prompts with the exact destructive target', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >().mockResolvedValue( true );

		await confirmEdgeWorkerDeletion( request, confirmFn );

		expect( confirmFn ).toHaveBeenCalledWith(
			'Permanently delete edge worker "headers" from example-app.production?'
		);
	} );

	it( 'throws UserError when the user declines deletion', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >().mockResolvedValue( false );

		await expect( confirmEdgeWorkerDeletion( request, confirmFn ) ).rejects.toEqual(
			new UserError( 'Command cancelled by user.' )
		);
	} );

	it( 'does not prompt when force is set', async () => {
		const confirmFn = jest.fn< Promise< boolean >, [ string ] >();

		await confirmEdgeWorkerDeletion( { ...request, force: true }, confirmFn );

		expect( confirmFn ).not.toHaveBeenCalled();
	} );
} );
