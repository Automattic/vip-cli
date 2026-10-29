import command from '../lib/cli/command';

import type { OutputFormat } from '../lib/cli/format';

export interface AppEnvOptions {
	app: {
		id: number;
		name: string;
		typeId: number;
		organization: { id: number; salesforceId: string };
	};
	env: { id: number; type: string; name?: string | null; appId?: number };
	format?: OutputFormat;
	skipConfirmation?: boolean;
	fromFile?: string;
	nonInteractive?: boolean;
	force?: boolean;
}

const usage = 'vip config';
const exampleUsage = 'vip @example-app.develop config';

// Command examples
const examples = [
	{
		usage: `${ exampleUsage } envvar list`,
		description: 'List the names of all environment variables on the environment.',
	},
	{
		usage: `${ exampleUsage } software get`,
		description: 'Retrieve the current versions of all environment software.',
	},
];

export default command( {
	requiredArgs: 2,
	usage,
} )
	.command( 'envvar', 'Manage environment variables for an environment.' )
	.command( 'software', 'Manage versions of software for an environment.' )
	.examples( examples )
	.argv( process.argv, () => {
		process.exit( 0 );
	} );
