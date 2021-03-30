#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
	SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED,
} from 'lib/site-import/db-file-import';
// eslint-disable-next-line no-duplicate-imports
import { trackEventWithEnv } from 'lib/tracker';
import { formatEnvironment, formatSearchReplaceValues, getGlyphForStatus } from 'lib/cli/format';

export type WPSiteListType = {
	id: string,
	homeUrl: string,
};

const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		id
		appId
		type
		name
		launched
		primaryDomain { name }
		wpSites {
			nodes {
				homeUrl
				id
			}
		}
	}
`;

const debug = debugLib( 'vip:vip-import-media' );

// Command examples for the `vip import media` help prompt
const examples = [
	// `media status` subcommand
	{
		usage: 'vip import media status @mysite.develop',
		description:
			'Check the status of the most recent import. If an import is running, this will poll until it is complete.',
	},
];

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	module: 'import-media',
	requireConfirm: 'Are you sure you want to import the contents of the provided file?',
	skipConfirmPrompt: true,
} )
	.command( 'status', 'Check the status of the current running import' )
	.examples( examples )
	.argv( process.argv, async ( args: string[], opts ) => {
		debug( 'Options: ', opts );
		debug( 'Args:', args );
	} );

