#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { appQuery, appQueryFragments } from 'lib/config/software';
import { promptForUpdate } from '../lib/config/software';

const cmd = command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	wildcardCommand: true,
} );
cmd.option( 'force', 'Auto-confirm update' );
cmd.argv( process.argv, async ( arg: string[], opt ) => {
	const { app, env } = opt;
	const { softwareSettings } = env;

	if ( softwareSettings === null ) {
		// TODO throw user error
		console.log( chalk.yellow( 'Note:' ), 'Software settings are not supported for this environmnet.' );
		process.exit();
	}

	const updateOptions: UpdatePromptOptions = {
		force: !! opt.force,
	};

	if ( arg.length > 0 ) {
		updateOptions.component = arg[ 0 ];
	}
	if ( arg.length > 1 ) {
		updateOptions.version = arg[ 1 ];
	}

	const updateData = await promptForUpdate( app.typeId, updateOptions, softwareSettings );

	console.log('e', updateData);


} );
