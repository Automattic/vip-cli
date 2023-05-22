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
import command from '../lib/cli/command';
import { ExportSQLCommand } from '../commands/export-sql';


const examples = [
  {
    usage: 'vip export sql @mysite.develop --output=/home/user/export.sql.gz',
    description: 'Export SQL file from your site and save it to the specified location',
  }
];

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
    primaryDomain { name }
  }
`;

command( {
	appContext: true,
	appQuery,
	envContext: true,
	module: 'export-sql',
	requiredArgs: 0,
  usage: 'vip export sql'
} )
	.option(
		'output',
    'Specify the location where you want to save the export file',
	)
	.examples( examples )
	.argv( process.argv, async ( arg: string[], { app, env, output } ) => {
    const exportCommand = new ExportSQLCommand( app, env, output );
    await exportCommand.run();
  } );
