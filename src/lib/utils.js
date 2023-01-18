import { setTimeout } from 'node:timers/promises';

/**
 * Polls a function until its return value satisfies a condition
 *
 * @param {Function} fn       A function to poll
 * @param {number}   interval Poll interval in milliseconds
 * @param {Function} isDone   A function that accepts the return of `fn`. Stops the polling if it returns true
 * @return {Promise}          A promise which resolves when the polling is done
 * @throws {Error}            If the fn throws an error
 */
export async function pollUntil( fn, interval, isDone ) {
	// eslint-disable-next-line no-constant-condition
	while ( true ) {
		// eslint-disable-next-line no-await-in-loop
		const result = await fn();
		if ( isDone( result ) ) {
			return;
		}

		// eslint-disable-next-line no-await-in-loop
		await setTimeout( interval );
	}
}
