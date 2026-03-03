#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip defensive-mode';
const exampleUsage = 'vip @example-app.develop defensive-mode';

const examples = [
	{
		usage: `${ exampleUsage } enable`,
		description: 'Enable Defensive Mode bot/DDoS protection.',
	},
	{
		usage: `${ exampleUsage } disable`,
		description: 'Disable Defensive Mode bot/DDoS protection.',
	},
	{
		usage: `${ exampleUsage } status`,
		description: 'Display current Defensive Mode status and statistics.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.command( 'enable', 'Enable Defensive Mode bot/DDoS protection.' )
	.command( 'disable', 'Disable Defensive Mode bot/DDoS protection.' )
	.command( 'status', 'Display current Defensive Mode status and statistics.' )
	.examples( examples )
	.argv( process.argv );
