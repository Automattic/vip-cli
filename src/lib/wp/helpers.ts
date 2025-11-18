type Action = 'continue' | 'done';
export type State =
	| 'S0' /* Normal */
	| 'S1' /* After backslash */
	| 'S2' /* Inside double quotes */
	| 'S3' /* After backslash inside double quotes */
	| 'S4' /* Inside single quotes */
	| 'FF' /* Final */;

export interface CmdState {
	state: State;
	command: string;
	done: boolean;
}

export function resetState( state: CmdState ): void {
	state.state = 'S0';
	state.command = '';
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
 * ```mermaid
 * stateDiagram
 *     direction LR
 *     [*] --> S0: "wp "
 *     S0 --> S1: backslash
 *     S0 --> S2: double-quote
 *     S0 --> S4: single-quote
 *     S0 --> [*]: newline
 *     S0 --> S0: [other]
 *     S1 --> [*]: newline
 *     S1 --> S0: [other]
 *     S2 --> S3: backslash
 *     S2 --> S0: double-quote
 *     S2 --> S2: [other]
 *     S3 --> S2: [any]
 *     S4 --> S0: '
 *     S4 --> S4: [other]
 * ```
 */
const stateTable: Record< State, State[] > = {
	/*    \     "     '     \n    other */
	S0: [ 'S1', 'S2', 'S4', 'FF', 'S0' ],
	S1: [ 'S0', 'S0', 'S0', 'FF', 'S0' ],
	S2: [ 'S3', 'S0', 'S2', 'S2', 'S2' ],
	S3: [ 'S2', 'S2', 'S2', 'S2', 'S2' ],
	S4: [ 'S4', 'S4', 'S0', 'S4', 'S4' ],
	FF: [ 'FF', 'FF', 'FF', 'FF', 'FF' ],
} as const;

const charMap: Record< string, number > = {
	'\\': 0,
	'"': 1,
	"'": 2,
	'\n': 3,
	other: 4,
} as const;

const stateToAction: Record< State, Action > = {
	S0: 'continue',
	S1: 'continue',
	S2: 'continue',
	S3: 'continue',
	S4: 'continue',
	FF: 'done',
} as const;

/**
 * Parses a line of WP-CLI command input using a state machine.
 *
 * Supports quoted strings, allowing for multiline commands.
 * The state machine transitions are defined by the `stateTable` above.
 * Multiline input is handled by appending a newline to the input.
 *
 * Due to the limitations of the internal command runner infrastructure,
 * the syntax is NOT shell-like:
 *   - escape sequences are not interpreted (e.g., `\n` is treated as two characters, not a newline)
 *   - backslash preceding a newline is not treated as a line continuation
 *
 * @param state The mutable command state object tracking parsing progress.
 * @param line The input line to parse (will be treated as a single line, with a newline appended).
 */
export function stateMachine( state: CmdState, line: string ): void {
	line += '\n';

	for ( const char of line ) {
		const charType = charMap[ char ] ?? charMap.other;
		state.state = stateTable[ state.state ][ charType ];

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
