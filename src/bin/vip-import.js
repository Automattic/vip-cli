#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import command, { getEnvIdentifier } from 'lib/cli/command';
import app from 'lib/api/app';
import { trackEvent } from 'lib/tracker';

command( { requiredArgs: 1, format: true } )
	.command( 'validate-files', 'List your VIP applications' )
	.command( 'validate-sql', 'List your VIP applications' )
	.example( 'vip import validate-files <file>', 'Run the media import validation against the file' )
	.example( 'vip import validate-sql <file>', 'Run the database import validation against the file' )
	.argv( process.argv );
