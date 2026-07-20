#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip defensive-mode';
const exampleUsage = 'vip @example-app.production defensive-mode';

const examples = [
	{
		usage: `${ exampleUsage } enable`,
		description: 'Enable defensive mode for the environment.',
	},
	{
		usage: `${ exampleUsage } disable`,
		description: 'Disable defensive mode for the environment.',
	},
	{
		usage: `${ exampleUsage } configure --enabled=true --challenge-type=1`,
		description: 'Update the defensive mode configuration non-interactively.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.command( 'enable', 'Enable defensive mode (step-up auth required).' )
	.command( 'disable', 'Disable defensive mode (step-up auth required).' )
	.command( 'configure', 'Update the defensive mode configuration (step-up auth required).' )
	.examples( examples )
	.argv( process.argv );
