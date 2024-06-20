#!/usr/bin/env node

import command from '../lib/cli/command';

const usage = 'vip cache';
const exampleUsage = 'vip @example-app.develop cache';

const examples = [
	{
		usage:
			`${ exampleUsage } purge-url https://example-app-develop.go-vip.co/sample-page/` +
			'\n    - Purged URL: https://example-app.develop.go-vip.co/sample-page/',
		description: 'Purge the page cache for a single URL.',
	},
	{
		usage: `${ exampleUsage } purge-url --from-file=./urls.txt`,
		description:
			'Purge the page cache for multiple URLs, each listed on a single line in a local file.',
	},
];

command( {
	requiredArgs: 1,
	usage,
} )
	.command( 'purge-url', 'Purge page cache for one or more URLs.' )
	.examples( examples )
	.argv( process.argv );
