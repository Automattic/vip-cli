import debugLib from 'debug';

import { getEnvIdentifier } from '../../lib/cli/command';

// Shared debugger.
export const debug = debugLib( '@automattic/vip:bin:config:envvar' );

// FIXME: Replace with a proper type
interface App {
	id: number;
}

export function getEnvContext( app: App, env: string ): string {
	return `@${ app.id }.${ getEnvIdentifier( env ) }`;
}
