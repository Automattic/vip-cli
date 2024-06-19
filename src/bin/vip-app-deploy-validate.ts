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
import { validateZipFile, validateTarFile } from '../lib/validations/custom-deploy';
import { trackEventWithEnv } from '../lib/tracker';

const debug = debugLib( '@automattic/vip:bin:vip-app-deploy-validate' );

export async function appDeployValidateCmd(
	arg: string[] = [],
	opts: Record< string, unknown > = {}
) {
	const app = opts.app as string | number;
	const env = opts.env as string | number;

	debug( 'file: ' + arg );
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

	console.log( chalk.green( '✓ Compressed file has been successfully validated with no errors!' ) );
}

// Command examples for the `vip app deploy validate` help prompt
const examples = [
	{
		usage: 'vip app @mysite.develop deploy validate <file.zip|file.tar.gz>',
		description: 'Validate the compressed file to see if it can be deployed to your site',
	},
];

void command( {
	requiredArgs: 1,
} )
	.examples( examples )
	.option( 'app', 'The application name or ID' )
	.option( 'env', 'The environment name or ID' )
	.argv( process.argv, appDeployValidateCmd );
