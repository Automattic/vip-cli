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
import { App, AppEnvironment, AppEnvironmentDeployInput } from '../graphqlTypes';
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
import { gates, renameFile } from '../lib/manual-deploy/manual-deploy';
import { trackEventWithEnv } from '../lib/tracker';

const appQuery = `
	id,
	name,
	type,
	typeId
	organization { id, name },
	environments{
		id
		appId
		type
		name
		launched
		isK8sResident
		syncProgress { status }
		primaryDomain { name }
		wpSites {
			nodes {
				homeUrl
				id
			}
		}
	}
`;

const START_DEPLOY_MUTATION = gql`
	mutation StartDeploy($input: AppEnvironmentDeployInput) {
		startDeploy(input: $input) {
			app {
				id
				name
			}
			message
			success
		}
	}
`;

const debug = debugLib( '@automattic/vip:bin:vip-deploy-app' );

const DEPLOY_PREFLIGHT_PROGRESS_STEPS = [
	{ id: 'upload', name: 'Uploading file' },
	{ id: 'deploy', name: 'Deploying' },
];

interface PromptToContinueParams {
	launched: boolean;
	formattedEnvironment: string;
	track: ( eventName: string ) => Promise< false | unknown[] >;
	domain: string;
}

interface StartDeployVariables {
	input: AppEnvironmentDeployInput;
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

	if ( promptResponse.confirmedDomain !== promptToMatch ) {
		await params.track( 'deploy_app_unexpected_input' );
		exit.withError( 'The input did not match the expected environment label. Deploy aborted.' );
	}
}

export async function deployAppCmd( arg: string[] = [], opts: Record< string, unknown > = {} ) {
	const app = opts.app as App;
	const env = opts.env as AppEnvironment;

	const [ fileName ] = arg;
	let fileMeta = await getFileMeta( fileName );

	debug( 'Options: ', opts );
	debug( 'Args: ', arg );

	const appId = env.appId as number;
	const envId = env.id as number;
	const track = trackEventWithEnv.bind( null, appId, envId );

	await gates( app, env, fileMeta );

	await track( 'deploy_app_command_execute' );

	const deployMessage = ( opts.message as string ) ?? '';
	const forceDeploy = opts.force;

	const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;
	if ( ! forceDeploy ) {
		const promptParams: PromptToContinueParams = {
			launched: Boolean( env.launched ),
			formattedEnvironment: formatEnvironment( env.type as string ),
			track,
			domain,
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
		progressTracker.suffix = `\n${ getGlyphForStatus( status, progressTracker.runningSprite ) } ${
			status === 'running' ? 'Loading remaining steps...' : ''
		}`;
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
	const api = await API();

	const progressCallback = ( percentage: string ) => {
		progressTracker.setUploadPercentage( percentage );
	};

	try {
		fileMeta = await renameFile( fileMeta );
	} catch ( err ) {
		throw new Error(
			`Unable to copy file to temporary working directory: ${ ( err as Error ).message }`
		);
	}

	const appInput = { id: appId } as WithId;
	const envInput = { id: envId } as WithId;
	const uploadParams: UploadArguments = {
		app: appInput,
		env: envInput,
		fileMeta,
		progressCallback,
	};
	const startDeployVariables: StartDeployVariables = { input: {} };

	try {
		const {
			fileMeta: { basename },
			md5,
			result,
		} = await uploadImportSqlFileToS3( uploadParams );

		startDeployVariables.input = {
			id: app.id,
			environmentId: env.id,
			basename: fileMeta.basename,
			md5,
			deployMessage,
		};

		debug( { basename, md5, result, startDeployVariables } );
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

	// Start the deploy
	try {
		const startDeployResults = await api.mutate( {
			mutation: START_DEPLOY_MUTATION,
			variables: startDeployVariables,
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
	console.log( `\nSuccessfully deployed ${ fileName } to ${ domain }. All set!` );
}

// Command examples for the `vip deploy app` help prompt
const examples = [
	// `app` subcommand
	{
		usage: 'vip deploy app @mysite.develop file.zip',
		description: 'Deploy the given compressed file to your site',
	},
	{
		usage: 'vip deploy app @mysite.develop file.zip --message "This is a deploy message"',
		description: 'Deploy the given compressed file to your site',
	},
	{
		usage: 'vip deploy app @mysite.develop file.zip --force',
		description: 'Deploy the given compressed file to your site without prompting',
	},
];

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
} )
	.examples( examples )
	.option( 'message', 'Custom message for deploy' )
	.option( 'force', 'Skip prompt' )
	.argv( process.argv, deployAppCmd );
