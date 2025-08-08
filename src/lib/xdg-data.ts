import { homedir } from 'node:os';
import { join } from 'node:path';

export function xdgData(): string {
	// Use the XDG_DATA_HOME environment variable if set, otherwise default to ~/.local/share
	const xdgDataHome = process.env.XDG_DATA_HOME;
	if ( xdgDataHome !== undefined ) {
		return xdgDataHome;
	}

	const homeDirectory = homedir();
	return join( homeDirectory, '.local', 'share' );
}
