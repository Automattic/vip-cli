#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( { requiredArgs: 1, format: true } )
	.example( 'vip import validate files <file>', 'Validate your media files' )
	.argv( process.argv, async ( arg, opts ) => {
	} );