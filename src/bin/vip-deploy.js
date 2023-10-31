#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';

command()
	.command( 'app', 'Deploy to your app from a file' )
	.example(
		'vip deploy app @mysite.develop <file.zip>',
		'Import the given compressed file to your site'
	)
	.argv( process.argv, async () => {
		await trackEvent( 'vip_deploy_command_execute' );
	} );
