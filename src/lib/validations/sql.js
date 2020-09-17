/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import readline from 'readline';
import fs from 'fs';
import chalk from 'chalk';
import { stdout as log } from 'single-line-log';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';

let problemsFound = 0;
let lineNum = 1;

const errorCheckFormatter = check => {
	if ( check.results.length > 0 ) {
		problemsFound += 1;
		console.error( chalk.red( 'Error:' ), `${ check.message } on line(s) ${ check.results.join( ',' ) }.` );
		console.error( chalk.yellow( 'Recommendation:' ), `${ check.recommendation }` );
	} else {
		console.log( `✅ ${ check.message } was found ${ check.results.length } times.` );
	}
};

const requiredCheckFormatter = ( check, type ) => {
	if ( check.results.length > 0 ) {
		console.log( `✅ ${ check.message } was found ${ check.results.length } times.` );
		if ( type === 'createTable' ) {
			checkTablePrefixes( check.results );
		}
	} else {
		problemsFound += 1;
		console.error( chalk.red( 'Error:' ), `${ check.message } was not found.` );
		console.error( chalk.yellow( 'Recommendation:' ), `${ check.recommendation }` );
	}
};

const infoCheckFormatter = check => {
	check.results.forEach( item => {
		console.log( item );
	} );
};

export type CheckType = {
    excerpt: string,
    matchHandler: Function,
    matcher: RegExp | string,
    message: string,
    outputFormatter: Function,
    recommendation: string,
    results: Array<string | empty>,
};

export type Checks = {
    useDB: CheckType,
	createDB: CheckType,
	dropDB: CheckType,
	alterUser: CheckType,
	dropTable: CheckType,
	createTable: CheckType,
	siteHomeUrl: CheckType,
};

const checks: Checks = {
	useDB: {
		matcher: /^use\s/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'USE statement',
		excerpt: '\'USE\' statement should not be present (case-insensitive, at beginning of line)',
		recommendation: 'Remove these lines',
	},
	createDB: {
		matcher: /^CREATE DATABASE/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'CREATE DATABASE statement',
		excerpt: '\'CREATE DATABASE\' statement should not  be present (case-insensitive)',
		recommendation: 'Remove these lines',
	},
	dropDB: {
		matcher: /^DROP DATABASE/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'DROP DATABASE statement',
		excerpt: '\'DROP DATABASE\' should not be present (case-insensitive)',
		recommendation: 'Remove these lines',
	},
	alterUser: {
		matcher: /^(ALTER USER|SET PASSWORD)/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'ALTER USER statement',
		excerpt: '\'ALTER USER\' should not be present (case-insensitive)',
		recommendation: 'Remove these lines',
	},
	dropTable: {
		matcher: /^DROP TABLE IF EXISTS `?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => results [ 1 ],
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'DROP TABLE',
		excerpt: '\'DROP TABLE IF EXISTS\' should be present (case-insensitive)',
		recommendation: 'Check import settings to include DROP TABLE statements',
	},
	createTable: {
		matcher: /^CREATE TABLE `?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => results [ 1 ],
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'CREATE TABLE',
		excerpt: '\'CREATE TABLE\' should be present (case-insensitive)',
		recommendation: 'Check import settings to include CREATE TABLE statements',
	},
	siteHomeUrl: {
		matcher: '\'(siteurl|home)\',\\s?\'(.*?)\'',
		matchHandler: ( lineNumber, results ) => results [ 0 ],
		outputFormatter: infoCheckFormatter,
		results: [],
		message: 'Siteurl/home matches',
		excerpt: 'Siteurl/home options',
		recommendation: '',
	},
};

function checkTablePrefixes( tables ) {
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
		problemsFound += 1;
		console.error( chalk.red( 'Error:' ), `tables without wp_ prefix found: ${ notWPTables.join( ',' ) } ` );
	}
	if ( wpMultisiteTables.length > 0 ) {
		console.log( ` - wp_n_ prefix tables found: ${ wpMultisiteTables.length } ` );
	}
}

export const validate = async ( filename: string, isImport: boolean = true ) => {
	await trackEvent( 'import_validate_sql_command_execute', { isImport } );

	const readInterface = readline.createInterface( {
		input: fs.createReadStream( filename ),
		output: null,
		console: false,
	} );

	readInterface.on( 'line', function( line ) {
		if ( lineNum % 500 === 0 ) {
			log( `Reading line ${ lineNum } ` );
		}

		const checkValues: any = Object.values( checks );
		checkValues.forEach( ( check: CheckType ) => {
			const results = line.match( check.matcher );
			if ( results ) {
				check.results.push( check.matchHandler( lineNum, results ) );
			}
		} );
		lineNum += 1;
	} );

	readInterface.on( 'close', async () => {
		log( `Finished processing ${ lineNum } lines.` );
		console.log( '\n' );
		const errorSummary = {};
		const checkEntires: any = Object.entries( checks );
		for ( const entry of checkEntires ) {
			const [ type, check ]: [string, CheckType] = entry;
			check.outputFormatter( check, type );
			console.log( '' );

			// Change `type` to snake_case for Tracks events
			const typeToSnakeCase = type.replace( /([A-Z])/, '_$1' ).toLowerCase();

			errorSummary[ typeToSnakeCase ] = check.results.length;
		}
		errorSummary.problems_found = problemsFound;

		if ( problemsFound > 0 ) {
			console.error( `Total of ${ chalk.red( problemsFound ) } errors found` );
			if ( isImport ) {
				// If we're running this as part of an import command, bail out here
				process.exit( 1 );
			}
		} else {
			console.log( '✅ Your database file looks good.  You can now submit for import, see here for more details: ' +
            'https://wpvip.com/documentation/vip-go/migrating-and-importing-content/#submitting-the-database' );
		}

		await trackEvent( 'import_validate_sql_command_success', { isImport, errorSummary } );
	} );
};
