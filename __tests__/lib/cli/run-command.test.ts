import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runCommand } from '../../../src/lib/cli/run-command';

describe( 'in-process command loader', () => {
	let directory: string;
	let originalArgv: string[];

	beforeEach( () => {
		directory = mkdtempSync( path.join( tmpdir(), 'vip-command-loader-' ) );
		originalArgv = process.argv;
	} );

	afterEach( () => {
		process.argv = originalArgv;
		rmSync( directory, { recursive: true, force: true } );
	} );

	function fixture( source: string ): string {
		const filename = path.join( directory, 'command.cjs' );
		writeFileSync( filename, source );
		return filename;
	}

	it( 'awaits the handler in the same process and restores argv afterward', async () => {
		const filename = fixture( `exports.default = new Promise(resolve => {
			setImmediate(() => resolve({ pid: process.pid, argv: process.argv }));
		});` );
		const argv = [ process.execPath, filename, '--slug=example', '--', 'echo', '@literal' ];

		await expect( runCommand( filename, argv ) ).resolves.toEqual( { pid: process.pid, argv } );
		expect( process.argv ).toBe( originalArgv );
	} );

	it( 'propagates asynchronous errors and restores argv', async () => {
		const filename = fixture( `exports.default = new Promise((resolve, reject) => {
			setImmediate(() => reject(new Error('handler failed')));
		});` );

		await expect( runCommand( filename, [ process.execPath, filename ] ) ).rejects.toThrow(
			'handler failed'
		);
		expect( process.argv ).toBe( originalArgv );
	} );

	it( 'restores argv when loading a module fails', async () => {
		const filename = fixture( `throw new Error('module failed');` );

		await expect( runCommand( filename, [ process.execPath, filename ] ) ).rejects.toThrow(
			'module failed'
		);
		expect( process.argv ).toBe( originalArgv );
	} );

	it( 'rejects a missing execution export instead of reporting success', async () => {
		const filename = fixture( 'exports.other = true;' );

		await expect( runCommand( filename, [ process.execPath, filename ] ) ).rejects.toThrow(
			'Command module must export its execution promise'
		);
		expect( process.argv ).toBe( originalArgv );
	} );
} );
