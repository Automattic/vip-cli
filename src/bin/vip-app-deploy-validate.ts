#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';
import { extname } from 'path';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { getFileMeta } from '../lib/client-file-uploader';
import { validateFile } from '../lib/custom-deploy/custom-deploy';
import { trackEventWithEnv } from '../lib/tracker';
import { validateZipFile, validateTarFile } from '../lib/validations/custom-deploy';

const debug = debugLib( '@automattic/vip:bin:vip-app-deploy-validate' );
const baseUsage = 'vip app deploy validate';

export async function appDeployValidateCmd(
	arg: string[] = [],
	opts: Record< string, unknown > = {}
) {
	const app = opts.app as string | number;
	const env = opts.env as string | number;

	const [ fileName ] = arg;
	const fileMeta = await getFileMeta( fileName );

	debug( 'Options: ', opts );
	debug( 'Args: ', arg );

	const track = trackEventWithEnv.bind( null, app, env );

	debug( 'Validating file...' );
	await validateFile( app as number, env as number, fileMeta );

	await track( 'deploy_validate_app_command_execute' );

	const ext = extname( fileName );
	if ( ext === '.zip' ) {
		validateZipFile( fileName );
	} else {
		await validateTarFile( fileName );
	}

	console.log( chalk.green( '✓ Compressed file has been successfully validated with no errors.' ) );
}

// Command examples for the `vip app deploy validate` help prompt
const examples = [
	{
		usage: 'vip app deploy validate file.tar.gz',
		description: 'Validate the directory structure of the local archived file named "file.tar.gz".',
	},
];

void command( {
	requiredArgs: 1,
	usage: baseUsage,
} )
	.examples( examples )
	.argv( process.argv, appDeployValidateCmd );
