#!/usr/bin/env node

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import {
	currentUserCanImportForApp,
	isSupportedApp,
} from '../lib/site-import/db-file-import';
import {
	checkFileAccess,
	getFileSize,
	getFileMeta,
	isFile,
	uploadImportSqlFileToS3,
} from '../lib/client-file-uploader';
import { trackEventWithEnv } from '../lib/tracker';
import API from '../lib/api';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import { GB_IN_BYTES } from '../lib/constants/file-size';

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

/**
 * @param {AppForImport} app
 * @param {EnvForImport} env
 * @param {FileMeta} fileMeta
 */
export async function gates( app, env, fileMeta ) {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );
	const { fileName } = fileMeta;

	// TODO: validate the file and name

	if ( ! currentUserCanImportForApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unauthorized' } );
		exit.withError(
			'The currently authenticated account does not have permission to deploy to an application.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support deploys.'
		);
	}

	try {
		await checkFileAccess( fileName );
	} catch ( err ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-unreadable' } );
		exit.withError( `File '${ fileName }' does not exist or is not readable.` );
	}

	if ( ! ( await isFile( fileName ) ) ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-notfile' } );
		exit.withError( `Path '${ fileName }' is not a file.` );
	}

	const fileSize = await getFileSize( fileName );

	if ( ! fileSize ) {
		await track( 'deploy_app_command_error', { error_type: 'appfile-empty' } );
		exit.withError( `File '${ fileName }' is empty.` );
	}

	const maxFileSize = 4 * GB_IN_BYTES;
	if ( fileSize > maxFileSize ) {
		await track( 'deploy_app_command_error', {
			error_type: 'appfile-toobig',
			file_size: fileSize,
		} );
		exit.withError(
			`The deploy file size (${ fileSize } bytes) exceeds the limit (${ maxFileSize } bytes).`
		);
	}
}

// Command examples for the `vip deploy app` help prompt
const examples = [
	// `app` subcommand
	{
		usage: 'vip deploy app @mysite.develop file.zip',
		description: 'Deploy the given ZIP file to your site',
	},
];

const promptToContinue = async ( { launched, formattedEnvironment, track, domain } ) => {
	console.log();
	const promptToMatch = domain.toUpperCase();
	const promptResponse = await prompt( {
		type: 'input',
		name: 'confirmedDomain',
		message: `You are about to deploy to a ${
			launched ? 'launched' : 'un-launched'
		} ${ formattedEnvironment } site ${ chalk.yellow( domain ) }.\nType '${ chalk.yellow(
			promptToMatch
		) }' (without the quotes) to continue:\n`,
	} );

	if ( promptResponse.confirmedDomain !== promptToMatch ) {
		await track( 'deploy_app_unexpected_input' );
		exit.withError( 'The input did not match the expected environment label. Deploy aborted.' );
	}
};

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
} )
	.examples( examples )
	.argv( process.argv, async ( arg, opts ) => {
		const { app, env } = opts;
		const { id: envId, appId } = env;
		const [ fileName ] = arg;
		let fileMeta = await getFileMeta( fileName );

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		const track = trackEventWithEnv.bind( null, appId, envId );

		// await track( 'deploy_app_command_execute' );

		// await gates( app, env, fileMeta );

		// Log summary of deploy details
		const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;
		const formattedEnvironment = formatEnvironment( opts.env.type );
		const launched = opts.env.launched;

		let fileNameToUpload = fileName;

		// PROMPT TO PROCEED WITH THE DEPLOY
		await promptToContinue( {
			launched,
			formattedEnvironment,
			track,
			domain,
		} );

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

		const failWithError = failureError => {
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

		const startDeployVariables = {};

		const progressCallback = percentage => {
			progressTracker.setUploadPercentage( percentage );
		};

		fileMeta.fileName = fileNameToUpload;

		try {
			const {
				fileMeta: { basename },
				md5,
				result,
			} = await uploadImportSqlFileToS3( {
				app,
				env,
				fileMeta,
				progressCallback,
			} );

			startDeployVariables.input = {
				id: app.id,
				environmentId: env.id,
				basename,
				md5,
			};

			debug( { basename, md5, result, startDeployVariables } );
			debug( 'Upload complete. Initiating the deploy.' );
			progressTracker.stepSuccess( 'upload' );
			await track( 'deploy_app_upload_complete' );
		} catch ( uploadError ) {
			await track( 'deploy_app_command_error', {
				error_type: 'upload_failed',
				upload_error: uploadError.message,
			} );

			progressTracker.stepFailed( 'upload' );
			return failWithError( uploadError );
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
				gql_err: gqlErr,
			} );

			progressTracker.stepFailed( 'deploy' );
			return failWithError( `StartDeploy call failed: ${ gqlErr }` );
		}

		progressTracker.stepSuccess( 'deploy' );
		progressTracker.stopPrinting();
		console.log( `\nSuccessfully deployed ${fileName} to ${ domain }. All set!` );
	} );
