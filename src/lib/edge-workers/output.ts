// C0, DEL, and C1 controls can alter terminal state or forge surrounding output.
// eslint-disable-next-line no-control-regex
const TERMINAL_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
// eslint-disable-next-line no-control-regex
const TERMINAL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

export function hasTerminalControlCharacters( value: string ): boolean {
	return TERMINAL_CONTROL_CHARACTER.test( value );
}

/** Render untrusted text without allowing it to emit terminal control characters. */
export function escapeTerminalText( value: unknown ): string {
	return String( value ).replace( TERMINAL_CONTROL_CHARACTERS, character => {
		return `\\u${ character.charCodeAt( 0 ).toString( 16 ).padStart( 4, '0' ) }`;
	} );
}
