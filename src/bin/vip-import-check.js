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
import path from 'path';

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

		const checks = {
			useDB: {
				type: 'error',
				matcher: /^use\s/i,
				instances: [],
				message: 'USE statement',
				excerpt: '\'USE\' statement should not be present (case-insensitive, at beginning of line)',
				recommendation: 'Remove these lines',
			},
			createDB: {
				type: 'error',
				matcher: /^CREATE DATABASE/i,
				instances: [],
				message: 'CREATE DATABASE statement',
				excerpt: '\'CREATE DATABASE\' statement should not  be present (case-insensitive)',
				recommendation: 'Remove these lines',
			},
			dropDB: {
				type: 'error',
				matcher: /^DROP DATABASE/i,
				instances: [],
				message: 'DROP DATABASE statement',
				excerpt: '\'DROP DATABASE\' should not be present (case-insensitive)',
				recommendation: 'Remove these lines',
			},
			alterUser: {
				type: 'error',
				matcher: /^(ALTER USER|SET PASSWORD)/i,
				instances: [],
				message: 'ALTER USER statement',
				excerpt: '\'ALTER USER\' should not be present (case-insensitive)',
				recommendation: 'Remove these lines',
			},
			dropTable: {
				type: 'required',
				matcher: /^DROP TABLE IF EXISTS (`)?([a-z0-9_]*)/i,
				instances: [],
				message: 'DROP TABLE',
				excerpt: '\'DROP TABLE IF EXISTS\' should be present (case-insensitive)',
				recommendation: 'Check import settings to include DROP TABLE statements',
			},
			createTable: {
				type: 'required',
				matcher: /^CREATE TABLE (`)?([a-z0-9_]*)/i,
				instances: [],
				message: 'CREATE TABLE',
				excerpt: '\'CREATE TABLE\' should be present (case-insensitive)',
				recommendation: 'Check import settings to include CREATE TABLE statements',
			},
			siteHomeUrl: {
				type: 'info',
				matcher: '\'(siteurl|home)\',\\s?\'(.*?)\'',
				instances: [],
				message: 'Siteurl/home matches',
				excerpt: 'Siteurl/home options',
				recommendation: '',
			},
		};
		let lineNum = 1;
		let results = null;

		readInterface.on( 'line', function( line ) {
			if ( lineNum % 500 === 0 ) {
				log( `Reading line ${ lineNum } ` );
			}
			results = line.match( checks.useDB.matcher );
			if ( results ) {
				checks.useDB.instances.push( lineNum );
			}

			results = line.match( checks.createDB.matcher );
			if ( results ) {
				checks.createDB.instances.push( lineNum );
			}

			results = line.match( checks.dropDB.matcher );
			if ( results ) {
				checks.dropDB.instances.push( lineNum );
			}

			results = line.match( checks.alterUser.matcher );
			if ( results ) {
				checks.alterUser.instances.push( lineNum );
			}

			results = line.match( checks.dropTable.matcher );
			if ( results ) {
				const tableName = line.match( checks.dropTable.matcher );
				checks.dropTable.instances.push( tableName [ 2 ] );
			}

			results = line.match( checks.createTable.matcher );
			if ( results ) {
				checks.createTable.instances.push( results [ 2 ] );
			}

			results = line.match( checks.createTable.matcher );
			if ( results ) {
				checks.createTable.instances.push( results [ 2 ] );
			}
			results = line.match( checks.siteHomeUrl.matcher );
			if ( results ) {
				checks.siteHomeUrl.instances.push( results[ 0 ] );
			}
			lineNum += 1;
		} );

		readInterface.on( 'close', async function() {
			log( `Finished processing ${ lineNum } lines.` );
			console.log( '\n' );
			Object.keys( checks ).forEach( key => {
				const check = checks[ key ];
				console.log( '🔍', check.excerpt );
				if ( check.type === 'error' ) {
					if ( check.instances.length > 0 ) {
						problemsFound += 1;
						console.error( chalk.red( 'Error:' ), `${ check.message } on line(s) ${ check.instances.join( ',' ) }.` );
						console.error( chalk.yellow( 'Recommendation:' ), `${ check.recommendation }` );
					} else {
						console.log( `✅ ${ check.message } was found ${ check.instances.length } times.` );
					}
				} else if ( check.type === 'required' ) {
					if ( check.instances.length > 0 ) {
						console.log( `✅ ${ check.message } was found ${ check.instances.length } times.` );
						if ( key === 'createTable' ) {
							checkTables( check.instances );
						}
					} else {
						problemsFound += 1;
						console.error( chalk.red( 'Error:' ), `${ check.message } was not found.` );
						console.error( chalk.yellow( 'Recommendation:' ), `${ check.recommendation }` );
					}
				} else if ( check.type === 'info' ) {
					check.instances.forEach( item => {
						console.log( item );
					} );
				}
				console.log( '' );
			} );

			if ( problemsFound >= 0 ) {
				console.error( `Total of ${ chalk.red( problemsFound ) } errors found` );
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
		console.log( ` - wp_ prefix tables found: ${ wpTables.length } ` );
	}
	if ( notWPTables.length > 0 ) {
		console.error( chalk.red( 'Error:' ), `tables without wp_ prefix found: ${ notWPTables.join( ',' ) } ` );
	}
	if ( wpMultisiteTables.length > 0 ) {
		console.log( ` - wp_n_ prefix tables found: ${ wpMultisiteTables.length } ` );
	}
}
