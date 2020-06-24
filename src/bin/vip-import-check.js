#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
const readline = require( 'readline' );
const fs = require( 'fs' );
import chalk from 'chalk';

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
			useDB: { type: 'error', instances: [], message: 'Invalid USE statement' },
			createDB: { type: 'error', instances: [], message: 'Invalid CREATE DATABASE statement' },
			dropDB: { type: 'error', instances: [], message: 'Invalid DROP  DATABASE statement' },
			alterUser: { type: 'error', instances: [], message: 'Invalid ALTER USER statement' },
			dropTable: { type: 'required', instances: [], message: 'DROP TABLE' },
			createTable: { type: 'required', instances: [], message: 'CREATE TABLE' },
		};
		let lineNum = 1;

		readInterface.on( 'line', function( line ) {
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

		readInterface.on( 'close', function() {
			Object.keys( checks ).forEach( key => {
				const err = checks[ key ];
				if ( err.type === 'error' ) {
					if ( err.instances.length > 0 ) {
						problemsFound += 1;
						console.error( chalk.red( 'Error:' ), `${ err.message } on line(s) ${ err.instances.join( ',' ) }.` );
					}
				} else if ( err.type === 'required' ) {
					if ( err.instances.length > 0 ) {
						console.log( `✅ ${ err.message } was found ${ err.instances.length } times.` );
						if ( key === 'createTable' ) {
							checkTables( err.instances );
						}
					} else {
						console.error( chalk.red( 'Error:' ), `${ err.message } was not found.` );
					}
				}
			} );
			if ( siteUrlMatches.length > 0 ) {
				console.log( '' );
				console.log( chalk.blue( 'Siteurl/home matches' ) );
				siteUrlMatches.forEach( item => {
					console.log( item );
				} );
			}
		} );
	} );

function checkTables( tables ) {
	const wpTables = [], notWPTables = [], wpMultisiteTables = [];
	tables.forEach( tableName => {
		if ( tableName.match( /^wp_/ ) ) {
			wpTables.push( tableName );
		} else if ( ! tableName.match( /^wp_/ ) ) {
			notWPTables.push( tableName );
		} else if ( tableName.match( /^wp_(\d+_)/ ) ) {
			wpMultisiteTables.push( tableName );
		}
	} );
	if ( wpTables.length > 0 ) {
		console.log( `✅ wp_ prefix tables ${ wpTables.length } ` );
	}
	if ( notWPTables.length > 0 ) {
		console.error( chalk.red( 'Error:' ), `tables without wp_ prefix ${ notWPTables.join( ',' ) } ` );
	}
	if ( wpMultisiteTables.length > 0 ) {
		console.log( `✅ wp_n_ prefix tables ${ wpTables.length } ` );
	}
}
