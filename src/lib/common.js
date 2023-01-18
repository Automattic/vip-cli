/**
 * Polls a function until its return value satisfies a condition
 * @param       {function} fn A function to poll
 * @param       {int} interval Poll interval in milliseconds
 * @param       {function} isDone A function that accepts the return of `fn`. Stops the polling if it returns true
 * @resolves		{Promise} A promise which resolves when the polling is done
 */
export async function pollUntil( fn, interval, isDone ) {
	return await new Promise( async ( resolve, reject ) => {
		while ( true ) {
			try {
				const result = await fn();
				if ( isDone( result ) ) {
					return resolve();
				}
			} catch ( err ) {
				return reject( err );
			}

			await new Promise( res => setTimeout( res, interval ) );
		}
	} );
}
