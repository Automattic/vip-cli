#!/usr/bin/env node
// @flow

import { prompt } from 'enquirer';

/**
 * External dependencies
 */
const readline = require( 'readline' );
const fs = require( 'fs' );
import chalk from 'chalk';
const log = require( 'single-line-log' ).stdout;

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 1,
} )
	.example( 'vip import check <file>', 'Run the import checks against file' )
	.argv( process.argv, async ( arg, opts ) => {
		if ( ! arg && ! arg[ 0 ] ) {
			console.error( 'You must pass in a filename' );
			process.exit( 1 );
		}

		let problemsFound = 0;

		const readInterface = readline.createInterface( {
			input: fs.createReadStream( arg[ 0 ] ),
			output: null,
			console: false,
		} );

		let siteUrlMatches = [];
		const checks = {
			useDB: { type: 'error', instances: [], message: 'USE statement', excerpt: '\'USE\' statement should not be present (case-insensitive, at beginning of line)', recommendation: 'Remove these lines' },
			createDB: { type: 'error', instances: [], message: 'CREATE DATABASE statement', excerpt: '\'CREATE DATABASE\' statement should not  be present (case-insensitive)', recommendation: 'Remove these lines' },
			dropDB: { type: 'error', instances: [], message: 'DROP DATABASE statement', excerpt: '\'DROP DATABASE\' should not be present (case-insensitive)', recommendation: 'Remove these lines' },
			alterUser: { type: 'error', instances: [], message: 'ALTER USER statement', excerpt: '\'ALTER USER\' should not be present (case-insensitive)', recommendation: 'Remove these lines' },
			dropTable: { type: 'required', instances: [], message: 'DROP TABLE', excerpt: '\'DROP TABLE IF EXISTS\' should be present (case-insensitive)', recommendation: 'Check import settings to include DROP TABLE statements' },
			createTable: { type: 'required', instances: [], message: 'CREATE TABLE', excerpt: '\'CREATE TABLE\' should be present (case-insensitive)', recommendation: 'Check import settings to include CREATE TABLE statements' },
		};
		let lineNum = 1;

		readInterface.on( 'line', function( line ) {
			if ( lineNum % 1000 === 0 ) {
				log( `Reading line ${ lineNum } ` );
			}
			if ( /^use\s/i.test( line ) ) {
				checks.useDB.instances.push( lineNum );
			}

			if ( /^CREATE DATABASE/i.test( line ) ) {
				checks.createDB.instances.push( lineNum );
			}

			if ( /^DROP DATABASE/i.test( line ) ) {
				checks.dropDB.instances.push( lineNum );
			}

			if ( /^ALTER USER/i.test( line ) || /^SET PASSWORD/i.test( line ) ) {
				checks.alterUser.instances.push( lineNum );
			}

			if ( /^DROP TABLE IF EXISTS (`)?([a-z0-9_]*)/i.test( line ) ) {
				const tableName = line.match( /^DROP TABLE IF EXISTS (`)?([a-z0-9_]*)/i );
				checks.dropTable.instances.push( tableName [ 2 ] );
			}

			if ( /^CREATE TABLE (`)?([a-z0-9_]*)/i.test( line ) ) {
				const tableName = line.match( /^CREATE TABLE (`)?([a-z0-9_]*)/i )[ 2 ];
				checks.createTable.instances.push( tableName );
			}

			const homeMatch = line.match( '\'(siteurl|home)\',\\s?\'(.*?)\'' );
			if ( homeMatch ) {
				siteUrlMatches = siteUrlMatches.concat( homeMatch[ 0 ] );
			}
			lineNum += 1;
		} );

		readInterface.on( 'close', async function() {
			log( `Finished processing ${ lineNum } lines.` );
			console.log( '\n' );
			Object.keys( checks ).forEach( key => {
				const err = checks[ key ];
				console.log( '🔍', err.excerpt );
				if ( err.type === 'error' ) {
					if ( err.instances.length > 0 ) {
						problemsFound += 1;
						console.error( chalk.red( 'Error:' ), `${ err.message } on line(s) ${ err.instances.join( ',' ) }.` );
						console.error( chalk.yellow( 'Recommendation:' ), `${ err.recommendation }` );
					} else {
						console.log( `✅ ${ err.message } was found ${ err.instances.length } times.` );
					}
				} else if ( err.type === 'required' ) {
					if ( err.instances.length > 0 ) {
						console.log( `✅ ${ err.message } was found ${ err.instances.length } times.` );
						if ( key === 'createTable' ) {
							checkTables( err.instances );
						}
					} else {
						problemsFound += 1;
						console.error( chalk.red( 'Error:' ), `${ err.message } was not found.` );
						console.error( chalk.yellow( 'Recommendation:' ), `${ err.recommendation }` );
					}
				}
				console.log( '' );
			} );
			if ( siteUrlMatches.length > 0 ) {
				console.log( '' );
				console.log( chalk.blue( 'Siteurl/home matches' ) );
				siteUrlMatches.forEach( item => {
					console.log( item );
				} );
			}

			if ( problemsFound >= 0 ) {
				const c = await prompt( {
					type: 'confirm',
					name: 'continue',
					message: 'Do you want to auto-fix the above issues? (saves to a new file)',
				} );
				if ( c ) {
					console.log( 'Written to', arg [ 0 ] );
				}
			}
		} );
	} );

function checkTables( tables ) {
	const wpTables = [], notWPTables = [], wpMultisiteTables = [];
	tables.forEach( tableName => {
		if ( tableName.match( /^wp_(\d+_)/ ) ) {
			wpMultisiteTables.push( tableName );
		} else if ( tableName.match( /^wp_/ ) ) {
			wpTables.push( tableName );
		} else if ( ! tableName.match( /^wp_/ ) ) {
			notWPTables.push( tableName );
		}
	} );
	if ( wpTables.length > 0 ) {
		console.log( `✅ wp_ prefix tables found: ${ wpTables.length } ` );
	}
	if ( notWPTables.length > 0 ) {
		console.error( chalk.red( 'Error:' ), `tables without wp_ prefix found: ${ notWPTables.join( ',' ) } ` );
	}
	if ( wpMultisiteTables.length > 0 ) {
		console.log( `✅ wp_n_ prefix tables found: ${ wpMultisiteTables.length } ` );
	}
}
