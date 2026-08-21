/**
 * Parsing for location rules passed on the command line as
 * `<operator>:<value>` (e.g. `starts_with:/api/`). A location scopes which
 * request paths a worker runs on; workers without one run on all requests.
 */

import UserError from '../user-error';
import { hasTerminalControlCharacters } from './output';
import { EDGE_WORKER_LOCATION_OPERATORS } from './types';

import type { EdgeWorkerLocation, EdgeWorkerLocationOperator } from './types';

export function parseLocationOption( raw: string ): EdgeWorkerLocation {
	// `--location` passed without a value arrives as a boolean, not a string;
	// guard so we surface a clear error instead of a TypeError from `.indexOf()`.
	if ( typeof raw !== 'string' ) {
		throw new UserError(
			'The --location flag requires a value in the form "<operator>:<value>" ' +
				`(e.g. "starts_with:/api/"). Operators: ${ EDGE_WORKER_LOCATION_OPERATORS.join( ', ' ) }.`
		);
	}

	// Split on the first colon only: the value may itself contain colons.
	const separator = raw.indexOf( ':' );
	const operator = separator > 0 ? raw.slice( 0, separator ) : '';
	const value = separator > 0 ? raw.slice( separator + 1 ) : '';

	if (
		! ( EDGE_WORKER_LOCATION_OPERATORS as string[] ).includes( operator ) ||
		! value ||
		hasTerminalControlCharacters( value )
	) {
		throw new UserError(
			`Invalid location "${ raw }". Use "<operator>:<value>", where <operator> is one of: ` +
				`${ EDGE_WORKER_LOCATION_OPERATORS.join( ', ' ) } (e.g. "starts_with:/api/").`
		);
	}

	return { operator: operator as EdgeWorkerLocationOperator, value };
}
