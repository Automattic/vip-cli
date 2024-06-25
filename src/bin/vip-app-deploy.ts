#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import { AppEnvironmentCustomDeployInput } from '../graphqlTypes';
import API from '../lib/api';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import {
	getFileMeta,
	uploadImportSqlFileToS3,
	WithId,
	UploadArguments,
} from '../lib/client-file-uploader';
import { validateCustomDeployKey, validateFile } from '../lib/custom-deploy/custom-deploy';
import { trackEventWithEnv } from '../lib/tracker';

const START_DEPLOY_MUTATION = gql`
	mutation StartCustomDeploy($input: AppEnvironmentCustomDeployInput) {
		startCustomDeploy(input: $input) {
			success
			message
		}
	}
`;

const debug = debugLib( '@automattic/vip:bin:vip-app-deploy' );
const baseUsage = 'vip app deploy';

const DEPLOY_PREFLIGHT_PROGRESS_STEPS = [
	{ id: 'upload', name: 'Uploading file' },
	{ id: 'deploy', name: 'Triggering deployment' },
];

interface PromptToContinueParams {
	launched: boolean;
	formattedEnvironment: string;
	track: ( eventName: string ) => Promise< false | unknown[] >;
	domain: string;
}

interface StartCustomDeployVariables {
	input: AppEnvironmentCustomDeployInput;
}

/**
 * Prompt the user to confirm the environment they are deploying to.
 * @param {PromptToContinueParams} PromptToContinueParams
 */
export async function promptToContinue( params: PromptToContinueParams ) {
	const promptToMatch = params.domain.toUpperCase();
	const promptResponse = await prompt( {
		type: 'input',
		name: 'confirmedDomain',
		message: `You are about to deploy to a ${ params.launched ? 'launched' : 'un-launched' } ${
			params.formattedEnvironment
		} site ${ chalk.yellow( params.domain ) }.\nType '${ chalk.yellow(
			promptToMatch
		) }' (without the quotes) to continue:\n`,
	} );

	if ( ( promptResponse.confirmedDomain as string ).toUpperCase() !== promptToMatch ) {
		await params.track( 'deploy_app_unexpected_input' );
		exit.withError( 'The input did not match the expected environment label. Deploy aborted.' );
	}
}

export async function appDeployCmd( arg: string[] = [], opts: Record< string, unknown > = {} ) {
	const app = opts.app as string | number;
	const env = opts.env as string | number;

	const [ fileName ] = arg;
	const fileMeta = await getFileMeta( fileName );

	debug( 'Options: ', opts );
	debug( 'Args: ', arg );

	debug( 'Validating custom deploy key...' );
	const { appId, envId, ...validatedArgs } = await validateCustomDeployKey( app, env );
	debug( 'Validated environment data: ', { appId, envId, validatedArgs } );

	const track = trackEventWithEnv.bind( null, appId, envId );

	debug( 'Validating file...' );
	await validateFile( appId, envId, fileMeta );

	await track( 'deploy_app_command_execute' );

	// Upload file as different name to avoid overwriting existing same named files
	const datePrefix = new Date()
		.toISOString()
		// eslint-disable-next-line no-useless-escape
		.replace( /[\-T:\.Z]/g, '' )
		.slice( 0, 14 );
	fileMeta.basename = `${ datePrefix }-${ fileMeta.basename }`;

	const deployMessage = ( opts.message as string ) ?? '';
	const skipConfirm = opts.force || opts.skipConfirmation;

	if ( ! skipConfirm ) {
		const promptParams: PromptToContinueParams = {
			launched: Boolean( validatedArgs.launched ),
			formattedEnvironment: formatEnvironment( validatedArgs.envType ),
			track,
			domain: validatedArgs.primaryDomainName,
		};

		await promptToContinue( promptParams );
	}

	/**
	 * =========== WARNING =============
	 *
	 * NO `console.log` after this point!
	 * Yes, even inside called functions.
	 * It will break the progress printing.
	 *
	 * =========== WARNING =============
	 */
	const progressTracker = new ProgressTracker( DEPLOY_PREFLIGHT_PROGRESS_STEPS );

	let status = 'running';

	const setProgressTrackerPrefixAndSuffix = () => {
		progressTracker.prefix = `
=============================================================
Processing the file for deployment to your environment...
`;
		progressTracker.suffix = `\n${ getGlyphForStatus(
			status,
			progressTracker.runningSprite
		) } Running...`;
	};

	const failWithError = ( failureError: Error | string ) => {
		status = 'failed';
		setProgressTrackerPrefixAndSuffix();
		progressTracker.stopPrinting();
		progressTracker.print( { clearAfter: true } );

		exit.withError( failureError );
	};

	progressTracker.startPrinting( setProgressTrackerPrefixAndSuffix );

	progressTracker.stepRunning( 'upload' );

	// Call the Public API
	const api = API();

	const progressCallback = ( percentage: string ) => {
		progressTracker.setUploadPercentage( percentage );
	};

	const appInput = { id: appId } as WithId;
	const envInput = { id: envId } as WithId;
	const uploadParams: UploadArguments = {
		app: appInput,
		env: envInput,
		fileMeta,
		progressCallback,
		hashType: 'sha256',
	};
	const startDeployVariables: StartCustomDeployVariables = { input: {} };

	try {
		const {
			fileMeta: { basename },
			checksum,
			result,
		} = await uploadImportSqlFileToS3( uploadParams );

		startDeployVariables.input = {
			id: appId,
			environmentId: envId,
			basename: fileMeta.basename,
			checksum,
			deployMessage,
		};

		debug( { basename, checksum, result, startDeployVariables } );
		debug( 'Upload complete. Initiating the deploy.' );
		progressTracker.stepSuccess( 'upload' );
		await track( 'deploy_app_upload_complete' );
	} catch ( uploadError ) {
		await track( 'deploy_app_command_error', {
			error_type: 'upload_failed',
			upload_error: ( uploadError as Error ).message,
		} );

		progressTracker.stepFailed( 'upload' );
		return failWithError( uploadError as Error );
	}

	progressTracker.stepRunning( 'deploy' );

	// Start the deploy
	try {
		const WPVIP_DEPLOY_TOKEN = process.env.WPVIP_DEPLOY_TOKEN;
		const startDeployResults = await api.mutate( {
			mutation: START_DEPLOY_MUTATION,
			variables: startDeployVariables,
			context: {
				headers: {
					Authorization: `Bearer ${ WPVIP_DEPLOY_TOKEN }`,
				},
			},
		} );

		debug( { startDeployResults } );
	} catch ( gqlErr ) {
		progressTracker.stepFailed( 'deploy' );

		await track( 'deploy_app_command_error', {
			error_type: 'StartDeploy-failed',
			gql_err: gqlErr as Error,
		} );

		progressTracker.stepFailed( 'deploy' );
		return failWithError( `StartDeploy call failed: ${ ( gqlErr as Error ).message }` );
	}

	progressTracker.stepSuccess( 'deploy' );
	progressTracker.stopPrinting();

	progressTracker.suffix = '';
	progressTracker.print( { clearAfter: true } );

	const deploymentsUrl = `https://dashboard.wpvip.com/apps/${ appId }/${ validatedArgs.envUniqueLabel }/code/deployments`;
	console.log(
		`\n✅ ${ chalk.bold(
			chalk.underline( chalk.magenta( fileMeta.basename ) )
		) } has been sent for deployment to ${ chalk.bold(
			chalk.blue( validatedArgs.primaryDomainName )
		) }. \nTo check deployment status, go to ${ chalk.bold(
			'VIP Dashboard'
		) }: ${ deploymentsUrl }`
	);
}

// Command examples for the `vip deploy app` help prompt
const examples = [
	// `app` subcommand
	{
		usage: 'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.zip',
		description:
			'Deploy a local archived file named "file.zip" that contains application code to a VIP Platform environment that has Custom Deployment enabled.',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.tar --message="A description for this deploy"',
		description:
			'Add a descriptive message for the Custom Deployment of the archived file named "file.tar".',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.tar.gz --skip-confirmation',
		description:
			'Skip the confirmation prompt for the Custom Deployment of the archived file named "file.tar.gz" to the environment.',
	},
];

void command( {
	requiredArgs: 1,
	usage: baseUsage,
} )
	.command( 'validate', 'Validate the directory structure of an archived file.' )
	.examples( examples )
	.option( 'message', 'Add a description of a deployment.' )
	.option( 'skip-confirmation', 'Skip the confirmation prompt.' )
	.option( 'force', 'Skip confirmation prompt (deprecated)' )
	.option(
		'app',
		'Target an application. Accepts a string value for the application name or an integer for the application ID.'
	)
	.option( 'env', 'Target an environment. Accepts a string value for the environment type.' )
	.argv( process.argv, appDeployCmd );
