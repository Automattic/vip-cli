// @flow

/**
 * External dependencies
 */
import { spawn } from 'child_process';

let proc;
export default function pager() {
	const args = ( process.env.PAGER || 'less -FRX' ).split( ' ' );
	const bin = args.shift();

	proc = spawn( bin, args, { stdio: [ -1, 1, 2 ] } );
	proc.on( 'exit', () => {
		proc.stdin.emit( 'done' );
	} );

	return proc.stdin;
}

export function end() {
	proc.end();
}
