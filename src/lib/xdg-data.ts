import { homedir } from 'node:os';
import { join } from 'node:path';

export function xdgData(): string | undefined {
	// Use the XDG_DATA_HOME environment variable if set, otherwise default to ~/.local/share
	const xdgDataHome = process.env.XDG_DATA_HOME;
	if ( xdgDataHome ) {
		return xdgDataHome;
	}

	const homeDirectory = homedir();
	if ( homeDirectory ) {
		return join( homeDirectory, '.local', 'share' );
	}

	return undefined;
}
