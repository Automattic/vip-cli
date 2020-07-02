#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import url from 'url';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( { requiredArgs: 1, format: true } )
	.example( 'vip import validate files <file>', 'Validate your media files' )
	.argv( process.argv, async ( file, options ) => {
		// File comes in as an array as part of the args- turn it into a string
		const fileString = file.join();

		// Then parse the file to its URL parts
		file = url.parse( fileString );
		
		// Extract the path of the file
		const path = file.path;

		// Media files must be part of an uploads directory
		if ( path.search( 'uploads' ) === -1 ) {
			return console.error( 'Media files must be in an `uploads` directory' );
		}
	} );