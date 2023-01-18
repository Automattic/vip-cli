/**
 * Polls a function until its return value satisfies a condition
 * @param       {function} fn A function to poll
 * @param       {int} interval Poll interval in milliseconds
 * @param       {function} isDone A function that accepts the return of `fn`. Stops the polling if it returns true
 * @resolves		{Promise} A promise which resolves when the polling is done
 * @throws			{Error} If the fn throws an error
 */
export async function pollUntil( fn, interval, isDone ) {
	while ( true ) {
		const result = await fn();
		if ( isDone( result ) ) {
			return;
		}

		await new Promise( res => setTimeout( res, interval ) );
	}
}
