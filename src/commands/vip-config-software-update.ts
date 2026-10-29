import chalk from 'chalk';
import debugLib from 'debug';

import command from '../lib/cli/command';
import { ProgressTracker } from '../lib/cli/progress';
import {
	appQuery,
	appQueryFragments,
	getUpdateResult,
	promptForUpdate,
	triggerUpdate,
} from '../lib/config/software';
import { trackEvent } from '../lib/tracker';
import UserError from '../lib/user-error';

import type { AppEnvOptions } from './vip-config';
import type { ComponentName, UpdatePromptOptions } from '../lib/config/software';

interface SoftwareUpdateOptions extends AppEnvOptions {
	yes?: boolean;
	env: AppEnvOptions[ 'env' ] & {
		uniqueLabel: string;
		softwareSettings: Parameters< typeof promptForUpdate >[ 2 ] | null;
	};
}

const debug = debugLib( '@automattic/vip:bin:config-software' );

const UPDATE_SOFTWARE_PROGRESS_STEPS = [
	{ id: 'trigger', name: 'Trigger software update' },
	{ id: 'process', name: 'Process software update' },
];

const usage = 'vip config software update <wordpress|php|nodejs|muplugins> <version>';
const exampleUsage = 'vip @example-app.develop config software update';
const exampleUsageNode = 'vip @example-node-app.develop config software update';

const examples = [
	{
		usage: `${ exampleUsage } wordpress 6.4`,
		description: 'Update the version of WordPress on a WordPress environment to 6.4.x.',
	},
	{
		usage: `${ exampleUsage } wordpress managed_latest`,
		description:
			'Update a WordPress environment to the latest major version of WordPress, and automatically update WordPress to the next major version on a continual basis.',
	},
	{
		usage: `${ exampleUsage } php 8.3`,
		description: 'Update the version of PHP on a WordPress environment to 8.3.x.',
	},
	{
		usage: `${ exampleUsageNode } nodejs 18`,
		description: 'Update the version of Node.js on a Node.js environment to 18.x.',
	},
];

const cmd = command( {
	appContext: true,
	appQuery,
	appQueryFragments,
	envContext: true,
	wildcardCommand: true,
	usage,
} ).examples( examples );
cmd.option( 'yes', 'Skip the confirmation prompt and automatically submit "y".' );
export default cmd.argv< SoftwareUpdateOptions >( process.argv, async ( arg, opt ) => {
	const { app, env } = opt;
	const { softwareSettings } = env;

	const baseTrackingInfo = {
		environment_id: env?.id,
		args: JSON.stringify( arg ),
	};
	await trackEvent( 'config_software_update_execute', baseTrackingInfo );

	let updateData: Partial< Awaited< ReturnType< typeof promptForUpdate > > > = {};
	try {
		if ( softwareSettings === null ) {
			throw new UserError( 'Software settings are not supported for this environment.' );
		}

		const updateOptions: UpdatePromptOptions = {
			force: Boolean( opt.yes ),
		};

		if ( arg.length > 0 ) {
			updateOptions.component = arg[ 0 ] as ComponentName;
		}
		if ( arg.length > 1 ) {
			updateOptions.version = arg[ 1 ];
		}

		const selectedUpdate = await promptForUpdate( app.typeId, updateOptions, softwareSettings );
		updateData = selectedUpdate;

		const hasProcessJob = selectedUpdate.component !== 'nodejs';
		const steps = hasProcessJob
			? UPDATE_SOFTWARE_PROGRESS_STEPS
			: [ UPDATE_SOFTWARE_PROGRESS_STEPS[ 0 ] ];
		const progressTracker = new ProgressTracker( steps );

		progressTracker.startPrinting();
		progressTracker.stepRunning( 'trigger' );

		const triggerResult = await triggerUpdate( {
			appId: app.id,
			envId: env.id,
			...selectedUpdate,
		} );
		debug( 'Triggered update with result', triggerResult );

		progressTracker.stepSuccess( 'trigger' );

		if ( hasProcessJob ) {
			const updateResult = await getUpdateResult( app.id, env.id );

			if ( updateResult.ok ) {
				progressTracker.stepSuccess( 'process' );
			} else {
				progressTracker.stepFailed( 'process' );
			}
			progressTracker.print();
			progressTracker.stopPrinting();

			if ( updateResult.ok ) {
				console.log( chalk.green( '✓' ) + ' Software update complete' );
			} else {
				throw Error( updateResult.errorMessage );
			}
		} else {
			progressTracker.print();
			progressTracker.stopPrinting();
			const deploymentsLink = `https://dashboard.wpvip.com/apps/${ app.id }/${ env.uniqueLabel }/deploys`;
			const message =
				` A new build of the application code has been initiated and will be deployed using Node.js v${ selectedUpdate.version } when the build is successful\n` +
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
				error: ( error as Error )?.message,
			} );
		}
		throw error;
	}
} );
