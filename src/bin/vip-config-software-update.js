#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import {
	appQuery,
	appQueryFragments,
	getUpdateResult,
	promptForUpdate,
	triggerUpdate,
} from '../lib/config/software';
import { ProgressTracker } from '../lib/cli/progress';
import UserError from '../lib/user-error';
import { trackEvent } from '../lib/tracker';

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
	usage: 'vip @mysite.develop config software update <wordpress|php|nodejs|muplugins> <version>',
} ).examples( [
	{
		usage: 'vip @mysite.develop config software update wordpress 6.0',
		description: 'Update WordPress to 6.0.x',
	},
	{
		usage: 'vip @mysite.develop config software update nodejs 16',
		description: 'Update Node.js to v16',
	},
] );
cmd.option( 'yes', 'Auto-confirm update' );
cmd.argv( process.argv, async ( arg, opt ) => {
	const { app, env } = opt;
	const { softwareSettings } = env;

	const baseTrackingInfo = {
		environment_id: env?.id,
		args: JSON.stringify( arg ),
	};
	await trackEvent( 'config_software_update_execute', baseTrackingInfo );

	let updateData = {};
	try {
		if ( softwareSettings === null ) {
			throw new UserError( 'Software settings are not supported for this environment.' );
		}

		/** @type {UpdatePromptOptions} */
		const updateOptions = {
			force: !! opt.yes,
		};

		if ( arg.length > 0 ) {
			updateOptions.component = arg[ 0 ];
		}
		if ( arg.length > 1 ) {
			updateOptions.version = arg[ 1 ];
		}

		updateData = await promptForUpdate( app.typeId, updateOptions, softwareSettings );

		const hasProcessJob = updateData.component !== 'nodejs';
		const steps = hasProcessJob
			? UPDATE_SOFTWARE_PROGRESS_STEPS
			: [ UPDATE_SOFTWARE_PROGRESS_STEPS[ 0 ] ];
		const progressTracker = new ProgressTracker( steps );

		progressTracker.startPrinting();
		progressTracker.stepRunning( 'trigger' );

		const triggerResult = await triggerUpdate( { appId: app.id, envId: env.id, ...updateData } );
		debug( 'Triggered update with result', triggerResult );

		progressTracker.stepSuccess( 'trigger' );

		if ( hasProcessJob ) {
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
		} else {
			progressTracker.print();
			progressTracker.stopPrinting();
			const deploymentsLink = `https://dashboard.wpvip.com/apps/${ app.id }/${ env.uniqueLabel }/deploys`;
			const message =
				` A new build of the application code has been initiated and will be deployed using Node.js v${ updateData.version } when the build is successful\n` +
				`View the deployments page in VIP Dashboard for progress updates. - ${ deploymentsLink }`;
			console.log( chalk.green( '✓' ) + message );
		}
		await trackEvent( 'config_software_update_success', { ...baseTrackingInfo, ...updateData } );
	} catch ( error ) {
		if ( error instanceof UserError ) {
			await trackEvent( 'config_software_update_success', {
				...baseTrackingInfo,
				...updateData,
				user_error: error?.message,
			} );
		} else {
			await trackEvent( 'config_software_update_error', {
				...baseTrackingInfo,
				...updateData,
				error: error?.message,
			} );
		}
		throw error;
	}
} );
