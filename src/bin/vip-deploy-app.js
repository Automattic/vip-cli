#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import fs from 'fs';
import gql from 'graphql-tag';
import { mkdtemp } from 'node:fs/promises';
import os from 'os';
import path from 'path';

/**
 * Internal dependencies
 */
import API from '../lib/api';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import {
	checkFileAccess,
	getFileSize,
	getFileMeta,
	isFile,
	uploadImportSqlFileToS3,
} from '../lib/client-file-uploader';
import { GB_IN_BYTES } from '../lib/constants/file-size';
import { currentUserCanDeployForApp, isSupportedApp } from '../lib/manual-deploy/manual-deploy';
import { trackEventWithEnv } from '../lib/tracker';
import { validateDeployFileExt, validateFilename } from '../lib/validations/manual-deploy';

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
 * @param {App} app
 * @param {Env} env
 * @param {FileMeta} fileMeta
 */
export async function gates( app, env, fileMeta ) {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );
	const { fileName, basename } = fileMeta;

	if ( ! fs.existsSync( fileName ) ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-file' } );
		exit.withError( `Unable to access file ${ fileMeta.fileName }` );
	}

	try {
		validateFilename( basename );
	} catch ( error ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-filename' } );
		exit.withError( error );
	}

	try {
		validateDeployFileExt( fileName );
	} catch ( error ) {
		await track( 'deploy_app_command_error', { error_type: 'invalid-extension' } );
		exit.withError( error );
	}

	if ( ! currentUserCanDeployForApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unauthorized' } );
		exit.withError(
			'The currently authenticated account does not have permission to deploy to an application.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'deploy_app_command_error', { error_type: 'unsupported-app' } );
		exit.withError( 'The type of application you specified does not currently support deploys.' );
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

const promptToContinue = async ( { launched, formattedEnvironment, track, domain } ) => {
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

/**
 * Rename file so it doesn't get overwritten.
 * @param {FileMeta} fileMeta - The metadata of the file to be renamed.
 * @returns {FileMeta} The updated file metadata after renaming.
 */
export async function renameFile( fileMeta ) {
	const tmpDir = await mkdtemp( path.join( os.tmpdir(), 'vip-manual-deploys' ) );

	const datePrefix = new Date()
		.toISOString()
		// eslint-disable-next-line no-useless-escape
		.replace( /[\-T:\.Z]/g, '' )
		.slice( 0, 14 );
	const newFileBasename = `${ datePrefix }-${ fileMeta.basename }`;
	debug(
		`Renaming the file to ${ chalk.cyan( newFileBasename ) } from ${
			fileMeta.basename
		} prior to transfer...`
	);
	const newFileName = `${ tmpDir }/${ newFileBasename }`;

	fs.copyFileSync( fileMeta.fileName, newFileName );
	fileMeta.fileName = newFileName;
	fileMeta.basename = newFileBasename;

	return fileMeta;
};

export async function deployAppCmd( arg = [], opts = {} ) {
	const { app, env } = opts;
	const { id: envId, appId } = env;
	const [ fileName ] = arg;
	let fileMeta = await getFileMeta( fileName );

	debug( 'Options: ', opts );
	debug( 'Args: ', arg );

	const track = trackEventWithEnv.bind( null, appId, envId );

	await gates( app, env, fileMeta );

	await track( 'deploy_app_command_execute' );

	// Log summary of deploy details
	const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;
	const formattedEnvironment = formatEnvironment( opts.env.type );
	const launched = opts.env.launched;
	const deployMessage = opts.message ?? '';
	const forceDeploy = opts.force;

	if ( ! forceDeploy ) {
		await promptToContinue( {
			launched,
			formattedEnvironment,
			track,
			domain,
		} );
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

	try {
		fileMeta = await renameFile( fileMeta );
	} catch ( err ) {
		throw new Error( `Unable to copy file to temporary working directory: ${ err.message }` );
	}

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
			deployMessage,
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
