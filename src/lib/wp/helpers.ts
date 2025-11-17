type Action = 'continue' | 'done' | 'error';
export type State = 0 | 1 | 2 | 3 | 4 | 5;

export interface CmdState {
	state: State;
	command: string;
	error: boolean;
	done: boolean;
}

export function resetState( state: CmdState ): void {
	state.state = 0;
	state.command = '';
	state.error = false;
	state.done = false;
}

export function initState(): CmdState {
	const state: CmdState = {} as CmdState;
	resetState( state );
	return state;
}

const stateTable: State[][] = [
	/*         \  "  \n other */
	/* S0 */ [ 1, 2, 4, 0 ],
	/* S1 */ [ 0, 0, 4, 0 ],
	/* S2 */ [ 3, 0, 2, 2 ],
	/* S3 */ [ 2, 2, 2, 2 ],
] as const;

const charMap: Record< string, number > = {
	'\\': 0,
	'"': 1,
	'\n': 2,
} as const;

const stateToAction: Record< State, Action > = {
	0: 'continue',
	1: 'continue',
	2: 'continue',
	3: 'continue',
	4: 'done',
	5: 'error',
} as const;

export function stateMachine( state: CmdState, line: string ): void {
	line += '\n';

	for ( const char of line ) {
		const charType = charMap[ char ] ?? 3;
		state.state = stateTable[ state.state ][ charType ];
		state.command += char;

		switch ( stateToAction[ state.state ] ) {
			case 'done':
				state.done = true;
				return;

			case 'error': // Unreachable in current implementation
				state.error = true;
				return;

			default:
				continue;
		}
	}
}
