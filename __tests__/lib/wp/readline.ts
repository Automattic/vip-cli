import { createInterface as createReadlineInterface, type Interface } from 'node:readline';
import { PassThrough } from 'node:stream';

import {
	isReadlineClosed,
	safePause,
	safePrompt,
	safeResume,
	safeWrite,
	trackReadline,
} from '../../../src/lib/wp/readline';

function createInterface(): Interface {
	const input = new PassThrough();
	const output = new PassThrough();
	return createReadlineInterface( { input, output, terminal: false } );
}

describe( 'vip-wp readline guards', () => {
	describe( 'trackReadline / isReadlineClosed', () => {
		test( 'an untracked interface is never reported as closed', () => {
			const rl = createInterface();
			rl.close();
			expect( isReadlineClosed( rl ) ).toBe( false );
		} );

		test( 'a tracked interface is open until it closes', () => {
			const rl = createInterface();
			trackReadline( rl );
			expect( isReadlineClosed( rl ) ).toBe( false );
			rl.close();
		} );

		test( 'a tracked interface is closed after the close event', () => {
			const rl = createInterface();
			trackReadline( rl );
			rl.close();
			expect( isReadlineClosed( rl ) ).toBe( true );
		} );

		test( 'tracking reacts to input EOF, not just explicit close()', async () => {
			const input = new PassThrough();
			const output = new PassThrough();
			const rl = createReadlineInterface( { input, output, terminal: false } );
			const closed = new Promise< void >( resolve => rl.once( 'close', () => resolve() ) );
			trackReadline( rl );

			input.end();
			await closed;

			expect( isReadlineClosed( rl ) ).toBe( true );
		} );

		test( 'returns the same interface for chaining', () => {
			const rl = createInterface();
			expect( trackReadline( rl ) ).toBe( rl );
			rl.close();
		} );
	} );

	describe( 'when the interface is open', () => {
		test.each( [
			[ 'safeResume', safeResume, 'resume' ],
			[ 'safePause', safePause, 'pause' ],
			[ 'safePrompt', safePrompt, 'prompt' ],
		] as const )( '%s calls through to the interface', ( _name, fn, method ) => {
			const rl = trackReadline( createInterface() );
			const spy = jest.spyOn( rl, method );

			fn( rl );

			expect( spy ).toHaveBeenCalledTimes( 1 );
			rl.close();
		} );

		test( 'safeWrite calls through to the interface', () => {
			const rl = trackReadline( createInterface() );
			const spy = jest.spyOn( rl, 'write' );

			safeWrite( rl, 'wp option list\n' );

			expect( spy ).toHaveBeenCalledWith( 'wp option list\n', undefined );
			rl.close();
		} );
	} );

	describe( 'when the interface is closed', () => {
		test( 'safeResume does not throw and does not call through', () => {
			const rl = trackReadline( createInterface() );
			rl.close();
			const spy = jest.spyOn( rl, 'resume' );

			expect( () => safeResume( rl ) ).not.toThrow();
			expect( spy ).not.toHaveBeenCalled();
		} );

		test( 'safePause does not throw and does not call through', () => {
			const rl = trackReadline( createInterface() );
			rl.close();
			const spy = jest.spyOn( rl, 'pause' );

			expect( () => safePause( rl ) ).not.toThrow();
			expect( spy ).not.toHaveBeenCalled();
		} );

		test( 'safePrompt does not throw and does not call through', () => {
			const rl = trackReadline( createInterface() );
			rl.close();
			const spy = jest.spyOn( rl, 'prompt' );

			expect( () => safePrompt( rl ) ).not.toThrow();
			expect( spy ).not.toHaveBeenCalled();
		} );

		test( 'safeWrite does not throw and does not call through', () => {
			const rl = trackReadline( createInterface() );
			rl.close();
			const spy = jest.spyOn( rl, 'write' );

			expect( () => safeWrite( rl, 'wp option list\n' ) ).not.toThrow();
			expect( spy ).not.toHaveBeenCalled();
		} );
	} );
} );
