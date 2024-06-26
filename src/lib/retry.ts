// copied over from our internal lib

export const EXPONENTIAL_BACKOFF_STARTING_IN_50_MS = exponentialBackoff( 50 );
export const EXPONENTIAL_BACKOFF_STARTING_IN_100_MS = exponentialBackoff( 100 );
export const EXPONENTIAL_BACKOFF_STARTING_IN_200_MS = exponentialBackoff( 200 );

const MAX_INTERVAL_BETWEEN_ATTEMPTS = 600000; // 10 minutes

const NOOP = async () => {};

const DEFAULT_OPTIONS = {
	maxRetries: 4,
	interval: EXPONENTIAL_BACKOFF_STARTING_IN_100_MS,
	retryOnlyIf: () => Promise.resolve( true ),
	onRetry: NOOP,
	onFailedAttempt: NOOP,
};

export type Interval = number | ( ( retryAttemptNumber: number ) => number );

export interface RetryOnlyIfOptions {
	error: Error;
	attemptNumber: number;
}

export interface RetryOnFailedOptions extends RetryOnlyIfOptions {
	error: Error;
	attemptNumber: number;
	attemptDuration: number;
	attemptStartTime: Date;
	attemptEndTime: Date;
}

export interface RetryOptions {
	maxRetries?: number;
	interval?: Interval;
	retryOnlyIf?: ( options: RetryOnlyIfOptions ) => boolean | Promise< boolean >;
	onRetry?: ( options: { retryNumber: number } ) => void | Promise< void >;
	onFailedAttempt?: ( options: RetryOnFailedOptions ) => void | Promise< void >;
}

type FinalRetryOptions = Required< RetryOptions >;

/**
 * We don't need a strict Error instance, which can help in cases (probably
 * just tests) where code throws an object instead of an Error instance. We
 * really just need to check for an object with a message property.
 */
function isErrorLike( value: unknown ): value is Error {
	return (
		value instanceof Error || ( null !== value && 'object' === typeof value && 'message' in value )
	);
}

/**
 * Execute a <task> and retries <options.maxRetries> times while it fails.
 * @param {Object} [options] - The options.
 * @param {number} [options.maxRetries] - The max number of retry attempts to be executed.
 * @param {function|number} [options.interval] - The time to wait between retries in milliseconds.
 *   It can be either a number or a function.
 *   Function arguments: retryAttemptNumber.
 *   Expected return: a number representing the time in milliseconds.
 * @param {function} [options.retryOnlyIf] - A function used to determine if a retry should be attempted.
 *   Arguments: Object<{ error, attemptNumber }>.
 *   Expected return: boolean|Promise<boolean>.
 * @param {function} [options.onRetry] - A callback function executed right before a retry attempt.
 *   Arguments: Object<{ retryNumber: attemptNumber }>.
 *   Expected return: void|Promise<void>.
 * @param {function} [options.onFailedAttempt] - A callback function executed right after a failed attempt.
 *   Arguments: Object<{ error, attemptNumber, attemptDuration }>.
 *   Expected return: void|Promise<void>.
 * @param {function} task - The task to be executed.
 * @return {any} - The value returned by the provided <task> function when it is successfully executed
 */
export async function retry< T >(
	options: RetryOptions,
	task: () => T | Promise< T >
): Promise< T >;
export async function retry< T >( task: () => T | Promise< T > ): Promise< T >;
export async function retry< T >(
	optionsOrTask: RetryOptions | ( () => T | Promise< T > ),
	task?: () => T | Promise< T >
): Promise< T > {
	let options = optionsOrTask;

	if ( arguments.length < 3 && typeof optionsOrTask === 'function' ) {
		task = optionsOrTask as () => T | Promise< T >;
		options = {};
	}

	const finalOptions: FinalRetryOptions = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const { maxRetries, interval, retryOnlyIf, onRetry, onFailedAttempt } = finalOptions;

	validateTask( task );
	validateOptions( finalOptions );

	const maxAttempts = maxRetries + 1;

	for ( let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++ ) {
		/* eslint-disable no-await-in-loop */
		const attemptStart = Date.now();
		try {
			return await task();
		} catch ( caughtError: unknown ) {
			const attemptEnd = Date.now();
			const attemptDuration = attemptEnd - attemptStart;
			const attemptStartTime = new Date( attemptStart );
			const attemptEndTime = new Date( attemptEnd );
			const error = isErrorLike( caughtError ) ? caughtError : new Error( String( caughtError ) );

			await onFailedAttempt( {
				error,
				attemptNumber,
				attemptDuration,
				attemptStartTime,
				attemptEndTime,
			} );

			const shouldRetry = await retryOnlyIf( { error, attemptNumber } );

			if ( attemptNumber === maxAttempts || shouldRetry !== true ) {
				throw error;
			}

			await awaitInterval( interval, attemptNumber );

			await onRetry( { retryNumber: attemptNumber } );
		}
	}

	throw new Error( 'Error, wrong retry options set' );
}

function isValidInterval( interval: Interval ): boolean {
	if ( 'function' === typeof interval ) {
		return true;
	}

	return (
		typeof interval === 'number' &&
		Number.isInteger( interval ) &&
		interval >= 0 &&
		interval <= MAX_INTERVAL_BETWEEN_ATTEMPTS
	);
}

async function awaitInterval( interval: Interval, attemptNumber: number ): Promise< void > {
	let newInterval: number;

	if ( typeof interval === 'function' ) {
		newInterval = interval( attemptNumber );

		if ( ! isValidInterval( newInterval ) ) {
			throw new Error(
				`Invalid calculated interval for retry attempt ${ attemptNumber }: "${ newInterval }" (type: ${ typeof newInterval })`
			);
		}
	} else {
		newInterval = interval;
	}

	return new Promise( resolve => setTimeout( resolve, newInterval ) );
}

function validateTask< T >( task: T ): asserts task is NonNullable< T > {
	if ( typeof task !== 'function' ) {
		throw new Error( 'Invalid task: it should be a function' );
	}
}

function validateOptions( {
	maxRetries,
	interval,
	onFailedAttempt,
	retryOnlyIf,
}: FinalRetryOptions ) {
	if ( ! Number.isInteger( maxRetries ) || maxRetries < 0 ) {
		throw new Error( 'Invalid option "maxRetries": it should be an integer number >= 0' );
	}

	if ( ! isValidInterval( interval ) ) {
		const definition = `an integer number between 0 and ${ MAX_INTERVAL_BETWEEN_ATTEMPTS }`;
		throw new Error(
			`Invalid option "interval": it should be either ${ definition }, or a synchronous function which returns ${ definition }`
		);
	}

	if ( ! isValidInterval( interval ) ) {
		throw new Error(
			'Invalid option "interval": it should be either an integer number >= 0, or a synchronous function which returns an integer number >= 0'
		);
	}

	if ( typeof onFailedAttempt !== 'function' ) {
		throw new Error( 'Invalid option "onFailedAttempt": it should be a function' );
	}

	if ( typeof retryOnlyIf !== 'function' ) {
		throw new Error( 'Invalid option "retryOnlyIf": it should be a function' );
	}
}

export function exponentialBackoff(
	startMilliseconds: number
): ( retryAttemptNumber: number ) => number {
	return retryAttemptNumber => Math.pow( 2, retryAttemptNumber - 1 ) * startMilliseconds;
}
