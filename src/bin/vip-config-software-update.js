#!/usr/bin/env node

/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';
import { appQuery, appQueryFragments } from 'lib/config/software';
import { getUpdateResult, promptForUpdate, triggerUpdate } from '../lib/config/software';
import { ProgressTracker } from '../lib/cli/progress';
import UserError from '../lib/user-error';

const debug = debugLib( '@automattic/vip:bin:config-software' );

const UPDATE_SOFTWARE_PROGRESS_STEPS = [
	{ id: 'trigger', name: 'Trigger software update' },
	{ id: 'process', name: 'Process software update' },
];

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
		throw UserError( 'Software settings are not supported for this environmnet.' );
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

	const progressTracker = new ProgressTracker( UPDATE_SOFTWARE_PROGRESS_STEPS );

	progressTracker.startPrinting();
	progressTracker.stepRunning( 'trigger' );

	const triggerResult = await triggerUpdate( { appId: app.id, envId: env.id, ...updateData } );
	debug( 'Trigered update with result', triggerResult );

	progressTracker.stepSuccess( 'trigger' );

	const { ok, errorMessage } = await getUpdateResult( app.id, env.id );

	if ( ok ) {
		progressTracker.stepSuccess( 'process' );
	} else {
		progressTracker.stepFailed( 'process' );
	}
	progressTracker.print();
	progressTracker.stopPrinting();

	if ( ok ) {
		console.log( chalk.green( '✓' ) + ' Software update complete' );
	} else {
		throw Error( errorMessage );
	}
} );
