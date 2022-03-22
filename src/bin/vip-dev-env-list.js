#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { printAllEnvironmentsInfo } from 'lib/dev-environment/dev-environment-core';
import { handleCLIException } from 'lib/dev-environment/dev-environment-cli';
import { DEV_ENVIRONMENT_FULL_COMMAND } from 'lib/constants/dev-environment';

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } list`,
		description: 'Return information about all local dev environments',
	},
];

command()
	.examples( examples )
	.argv( process.argv, async () => {
		try {
			await printAllEnvironmentsInfo();
		} catch ( error ) {
			handleCLIException( error );
		}
	} );
