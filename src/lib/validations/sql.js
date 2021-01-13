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
		console.error( chalk.red( 'Error:' ), `${ check.message } on line(s) ${ check.results.join( ', ' ) }.` );
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
	trigger: CheckType,
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
	trigger: {
		matcher: /TRIGGER/,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'TRIGGER statement',
		excerpt: '\'TRIGGER\' statement should not be present (case-sensitive)',
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
	engineInnoDB: {
		matcher: /ENGINE=(?!(InnoDB))/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'ENGINE != InnoDB',
		excerpt: '\'ENGINE=InnoDB\' should be present (case-insensitive) for all tables',
		recommendation: 'Ensure your application works with InnoDB and update your SQL dump to include only \'ENGINE=InnoDB\' engine definitions in \'CREATE TABLE\' statements',
	},
};

function openFile( filename, flags = 'r', mode = 666 ) {
	return new Promise( ( resolve, reject ) => {
		fs.open( filename, flags, mode, ( err, fd ) => {
			if ( err ) {
				return reject( err );
			}
			resolve( fd );
		} );
	} );
}

export const validate = async ( filename: string, isImport: boolean = false ) => {
	await trackEvent( 'import_validate_sql_command_execute', { is_import: isImport } );
	console.log( `${ chalk.underline( 'Starting SQL Validation...' ) }` );

	let fd;

	try {
		fd = await openFile( filename );
	} catch ( e ) {
		console.log( chalk.red( 'Error: ' ) + 'The file at the provided path is either missing or not readable.' );
		console.log( 'Please check the input and try again.' );
		process.exit( 1 );
	}

	const readInterface = readline.createInterface( {
		input: fs.createReadStream( '', { fd } ),
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

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );

	log( `Finished processing ${ lineNum } lines.` );
	console.log( '\n' );
	const errorSummary = {};
	const checkEntires: any = Object.entries( checks );
	for ( const [ type, check ]: [string, CheckType] of checkEntires ) {
		check.outputFormatter( check, type );
		console.log( '' );

		errorSummary[ type ] = check.results.length;
	}
	// eslint-disable-next-line camelcase
	errorSummary.problems_found = problemsFound;

	if ( problemsFound > 0 ) {
		console.error( `** Total of ${ chalk.red( problemsFound ) } errors found ** ` );

		if ( isImport ) {
			//console.log();
			console.log( `${ chalk.red( 'Please adjust these error(s) before continuing on with the import.' ) }` );
			console.log();
		}
	
		await trackEvent( 'import_validate_sql_command_failure', { is_import: isImport, error: errorSummary } );
		return process.exit( 1 );
	}

	console.log( '✅ Your database file looks good.' );

	await trackEvent( 'import_validate_sql_command_success', { is_import: isImport } );

	readInterface.close();

	if ( isImport ) {
		console.log( '\n🎉 Continuing to the import process.' );
		return;
	}

	console.log( '\n🎉 You can now submit for import, see here for more details: ' +
		'https://docs.wpvip.com/how-tos/prepare-for-site-launch/migrate-content-databases/' );
};
