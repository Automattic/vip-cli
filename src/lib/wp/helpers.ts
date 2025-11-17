type Action = 'continue' | 'done';
export type State = 'S0' | 'S1' | 'S2' | 'S3' | 'FF';

export interface CmdState {
	state: State;
	command: string;
	error: boolean;
	done: boolean;
}

export function resetState( state: CmdState ): void {
	state.state = 'S0';
	state.command = '';
	state.error = false;
	state.done = false;
}

export function initState(): CmdState {
	const state: CmdState = {} as CmdState;
	resetState( state );
	return state;
}

/**
 * State machine table for parsing WP-CLI commands.
 *
 * States:
 *   - S0 - Normal
 *   - S1 - After backslash
 *   - S2 - Inside quotes
 *   - S3 - After backslash inside quotes
 *   - FF - Final state (done)
 *
 * ```mermaid
 * stateDiagram
 *     direction LR
 *     [*] --> S0: "wp "
 *     S0 --> S1: \\
 *     S0 --> S2: "
 *     S0 --> [*]: \n
 *     S0 --> S0: [other]
 *     S1 --> [*]: \n
 *     S1 --> S0: [other]
 *     S2 --> S3: \\
 *     S2 --> S0: "
 *     S2 --> S2: [other]
 *     S3 --> S2: [any]
 * ```
 */
const stateTable: State[][] = [
	/*         \     "     \n    other */
	/* S0 */ [ 'S1', 'S2', 'FF', 'S0' ],
	/* S1 */ [ 'S0', 'S0', 'FF', 'S0' ],
	/* S2 */ [ 'S3', 'S0', 'S2', 'S2' ],
	/* S3 */ [ 'S2', 'S2', 'S2', 'S2' ],
	/* FF  */ [ 'FF', 'FF', 'FF', 'FF' ],
] as const;

const charMap: Record< string, number > = {
	'\\': 0,
	'"': 1,
	'\n': 2,
	other: 3,
} as const;

const stateToRow: Record< State, number > = {
	S0: 0,
	S1: 1,
	S2: 2,
	S3: 3,
	FF: 4,
} as const;

const stateToAction: Record< State, Action > = {
	S0: 'continue',
	S1: 'continue',
	S2: 'continue',
	S3: 'continue',
	FF: 'done',
} as const;

export function stateMachine( state: CmdState, line: string ): void {
	line += '\n';

	for ( const char of line ) {
		const charType = charMap[ char ] ?? charMap.other;
		state.state = stateTable[ stateToRow[ state.state ] ][ charType ];

		switch ( stateToAction[ state.state ] ) {
			case 'done':
				state.done = true;
				return;

			case 'continue':
				state.command += char;
				continue;
		}
	}
}
