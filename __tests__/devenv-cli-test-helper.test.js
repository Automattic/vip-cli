/* eslint-disable jest/no-standalone-expect -- platform-conditional tests */
import { CliTest } from './devenv-e2e/helpers/cli-test';

describe( 'dev-env CLI subprocess helper', () => {
	const cli = new CliTest();
	const run = ( script, control ) =>
		cli.spawn( [ process.execPath, '-e', script ], {}, false, control );

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
