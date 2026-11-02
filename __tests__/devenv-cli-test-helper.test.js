/* eslint-disable jest/no-standalone-expect -- platform-conditional tests */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CliTest } from './devenv-e2e/helpers/cli-test';

function killEscapedChild( pidFile ) {
	try {
		const pid = readFileSync( pidFile, 'utf8' );
		if ( /^[1-9]\d*$/.test( pid ) ) process.kill( Number( pid ), 'SIGKILL' );
	} catch ( error ) {
		if ( error.code !== 'ENOENT' && error.code !== 'ESRCH' ) throw error;
	}
}

describe( 'dev-env CLI subprocess helper', () => {
	const cli = new CliTest();
	const run = ( script, control, args = [] ) =>
		cli.spawn( [ process.execPath, '-e', script, ...args ], {}, false, control );

	it( 'collects output until the inherited streams close', async () => {
		const script = `require('child_process').spawn(process.execPath, ['-e', "setTimeout(() => { console.log('late stdout'); console.error('late stderr'); }, 100)"], { stdio: 'inherit' });`;
		const result = await run( script );
		expect( result ).toEqual( { stdout: 'late stdout\n', stderr: 'late stderr\n', rc: 0 } );
	} );

	it( 'returns output and the exit status for normal and failing commands', async () => {
		expect( await run( "console.log('ok')" ) ).toEqual( { stdout: 'ok\n', stderr: '', rc: 0 } );
		expect( await run( "console.error('bad'); process.exitCode = 7" ) ).toEqual( {
			stdout: '',
			stderr: 'bad\n',
			rc: 7,
		} );
	} );

	it( 'rejects a spawn error', async () => {
		await expect( cli.spawn( [ '/nonexistent/vip-cli-test-command' ], {} ) ).rejects.toThrow();
	} );

	( process.platform === 'win32' ? it.skip : it )( 'reports a signal exit', async () => {
		expect( ( await run( "process.kill(process.pid, 'SIGTERM')" ) ).rc ).toBe( -1 );
	} );

	( process.platform === 'win32' ? it.skip : it )(
		'keeps the caller process group without cancellation',
		async () => {
			const group = pid =>
				execFileSync( 'ps', [ '-o', 'pgid=', '-p', String( pid ) ], { encoding: 'utf8' } ).trim();
			const result = await run(
				"console.log(require('child_process').execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], {encoding: 'utf8'}).trim())"
			);
			expect( result.stdout.trim() ).toBe( group( process.pid ) );
		}
	);

	( process.platform === 'win32' ? it.skip : it )(
		'does not spawn an already-aborted request',
		async () => {
			await expect(
				run( "console.log('unexpected')", { signal: AbortSignal.abort() } )
			).rejects.toThrow( 'aborted' );
		}
	);

	( process.platform === 'win32' ? it.skip : it )(
		'stops waiting for pipes held by an escaped descendant',
		async () => {
			const dir = mkdtempSync( path.join( os.tmpdir(), 'vip-cli-escaped-\'"$-child-' ) );
			const pidFile = path.join( dir, 'pid' );
			try {
				const script =
					"const child = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { detached: true, stdio: 'inherit' }); require('fs').writeFileSync(process.argv[1], String(child.pid)); child.unref();";
				const started = Date.now();
				await expect( run( script, { timeoutMs: 1000 }, [ pidFile ] ) ).rejects.toThrow(
					'timed out'
				);
				expect( Date.now() - started ).toBeLessThan( 5000 );
			} finally {
				killEscapedChild( pidFile );
				rmSync( dir, { recursive: true, force: true } );
			}
		}
	);

	( process.platform === 'win32' ? it.skip : it )(
		'terminates a descendant holding the streams on timeout and abort',
		async () => {
			const script = `require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });`;
			await expect( run( script, { timeoutMs: 500 } ) ).rejects.toThrow( 'timed out' );
			const controller = new AbortController();
			const pending = run( script, { signal: controller.signal } );
			setTimeout( () => controller.abort(), 500 );
			await expect( pending ).rejects.toThrow( 'aborted' );
		}
	);
} );
