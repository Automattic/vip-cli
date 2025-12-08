/**
 * single-line-log
 * Copyright (c) Tobias Baunbæk <freeall@gmail.com>
 *
 * This file is adapted from https://github.com/freeall/single-line-log
 *
 * NOTE: This file was copied locally because the original repository is no longer
 * maintained and contains a bug that causes line clearing to fail on most terminals
 * when output wraps across multiple physical lines. The fix uses '\r' instead of
 * '\x1b[1000D' for cursor positioning and outputs '\n' in clear().
 *
 * See: https://github.com/freeall/single-line-log/pull/21
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import stringWidth from 'string-width';

const MOVE_UP = Buffer.from( '1b5b3141', 'hex' ).toString();
const CLEAR_LINE = Buffer.from( '1b5b304b', 'hex' ).toString();

interface LogFunction {
	( ...args: unknown[] ): void;
	clear: () => void;
}

const singleLogLine = ( stream: NodeJS.WriteStream ): LogFunction => {
	if ( ! stream || typeof stream.write !== 'function' ) {
		throw new TypeError( 'Invalid stream provided' );
	}

	const write = stream.write;
	let str: string | null;

	stream.write = function ( data: unknown, ...args: unknown[] ) {
		if ( str && data !== str ) {
			str = null;
		}
		return write.apply( this, [ data, ...args ] as Parameters< typeof write > );
	};

	if ( stream === process.stderr || stream === process.stdout ) {
		process.on( 'exit', function () {
			if ( str !== null ) {
				stream.write( '' );
			}
		} );
	}

	let prevLineCount = 0;
	const log = function ( ...args: unknown[] ): void {
		str = '';
		const nextStr = Array.prototype.join.call( args, ' ' );

		// Move to beginning of line and clear, then move up for each previous line
		for ( let i = 0; i < prevLineCount; i++ ) {
			str += '\r' + CLEAR_LINE + ( i < prevLineCount - 1 ? MOVE_UP : '' );
		}

		// Actual log output
		str += nextStr;
		stream.write( str );

		// How many lines to remove on next clear screen
		const prevLines = nextStr.split( '\n' );
		prevLineCount = 0;
		for ( let i = 0; i < prevLines.length; i++ ) {
			prevLineCount += Math.ceil( stringWidth( prevLines[ i ] ) / stream.columns ) || 1;
		}
	} as LogFunction;

	log.clear = function () {
		stream.write( '\n' );
	};

	return log;
};

export default singleLogLine;
export const stdout = singleLogLine( process.stdout );
export const stderr = singleLogLine( process.stderr );
