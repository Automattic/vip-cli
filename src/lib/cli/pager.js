// @flow

/**
 * External dependencies
 */
import { spawn } from 'child_process';
import { PassThrough } from 'stream';

let proc;
export default function pager() {
	let less;
	switch ( process.platform ) {
		case 'win32':
			// PROGRA~1 is the short name for Program Files
			// we're using it here to avoid the space which is broken by .split( ' ' )
			less = 'C:\\PROGRA~1\\Git\\usr\\bin\\less.exe -FRX';
			break;

		default:
			less = 'less -FRX';
	}

	const args = ( process.env.PAGER || less ).split( ' ' );
	const bin = args.shift();

	// passthrough pipe so we can change the output pipe if necessary
	const pipe = new PassThrough();
	proc = spawn( bin, args, { stdio: [ 'pipe', process.stdout, process.stderr ] } );
	proc.on( 'exit', () => {
		proc.stdin.emit( 'done' );
	} );

	// If we can't spawn less, pipe directly to stdout
	pipe.pipe( proc.stdin );
	proc.on( 'error', () => {
		pipe.pipe( process.stdout );
	} );

	return pipe;
}

export function end() {
	proc.end();
}
