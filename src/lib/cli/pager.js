// @flow

/**
 * External dependencies
 */
import { spawn } from 'child_process';

let proc;
export default function pager() {
	const args = ( process.env.PAGER || 'less -FRX' ).split( ' ' );
	const bin = args.shift();

	proc = spawn( bin, args, { stdio: [ 'pipe', process.stdout, process.stderr ] } );
	proc.on( 'exit', () => {
		proc.stdin.emit( 'done' );
	} );

	return proc.stdin;
}

export function end() {
	proc.end();
}
