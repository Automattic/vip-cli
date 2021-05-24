/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import chalk from 'chalk';
import { stdout as log } from 'single-line-log';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import { getReadInterface } from 'lib/validations/line-by-line';
// eslint-disable-next-line no-duplicate-imports
import type { PostLineExecutionProcessingParams } from 'lib/validations/line-by-line';

let problemsFound = 0;
let lineNum = 1;
const tableNames = [];

function formatError( message ) {
	return `${ chalk.red( 'SQL Error:' ) } ${ message }`;
}

function formatRecommendation( message ) {
	return `${ chalk.yellow( 'Recommendation:' ) } ${ message }`;
}

const errorCheckFormatter = check => {
	const errors = [];
	const infos = [];

	if ( check.results.length > 0 ) {
		problemsFound += 1;
		errors.push( {
			error: formatError( `${ check.message } on line(s) ${ check.results.join( ', ' ) }.` ),
			recommendation: formatRecommendation( check.recommendation ),
		} );
	} else {
		infos.push( `✅ ${ check.message } was found ${ check.results.length } times.` );
	}

	return {
		errors,
		infos,
	};
};

const requiredCheckFormatter = ( check, type, isImport ) => {
	const errors = [];
	const infos = [];

	if ( check.results.length > 0 ) {
		infos.push( `✅ ${ check.message } was found ${ check.results.length } times.` );

		if ( type === 'createTable' ) {
			if ( ! isImport ) {
				checkTablePrefixes( check.results, errors, infos );
			}
		}
	} else {
		problemsFound += 1;

		errors.push( {
			error: formatError( `${ check.message } was not found.` ),
			recommendation: formatRecommendation( check.recommendation ),
		} );
	}

	return {
		errors,
		infos,
	};
};

const infoCheckFormatter = check => {
	const infos = [];

	check.results.forEach( item => {
		infos.push( item );
	} );

	return {
		errors: [],
		infos,
	};
};

function checkTablePrefixes( tables, errors, infos ) {
	const wpTables = [],
		notWPTables = [],
		wpMultisiteTables = [];
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
		infos.push( ` - wp_ prefix tables found: ${ wpTables.length } ` );
	}
	if ( notWPTables.length > 0 ) {
		problemsFound += 1;

		errors.push( {
			error: formatError( `tables without wp_ prefix found: ${ notWPTables.join( ',' ) }` ),
			recommendation: formatRecommendation(
				'Please make sure all table names are prefixed with `wp_`'
			),
		} );
	}

	if ( wpMultisiteTables.length > 0 ) {
		infos.push( ` - wp_n_ prefix tables found: ${ wpMultisiteTables.length } ` );
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
		excerpt: "'USE' statement should not be present (case-insensitive, at beginning of line)",
		recommendation: 'Remove these lines',
	},
	createDB: {
		matcher: /^CREATE DATABASE/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'CREATE DATABASE statement',
		excerpt: "'CREATE DATABASE' statement should not  be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	binaryLogging: {
		matcher: /SET @@SESSION.sql_log_bin/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'SET @@SESSION.sql_log_bin statement',
		excerpt: "'SET @@SESSION.sql_log_bin' statement should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	trigger: {
		// Match `CREATE (DEFINER=`root`@`host`) TRIGGER`
		matcher: /^CREATE (\(?DEFINER=`?(\w*)(`@`)?(\w*\.*%?)*`?\)?)?(| )TRIGGER/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'TRIGGER statement',
		excerpt: "'TRIGGER' statement should not be present (case-sensitive)",
		recommendation: 'Remove these lines',
	},
	dropDB: {
		matcher: /^DROP DATABASE/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'DROP DATABASE statement',
		excerpt: "'DROP DATABASE' should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	alterUser: {
		matcher: /^(ALTER USER|SET PASSWORD)/i,
		matchHandler: lineNumber => lineNumber,
		outputFormatter: errorCheckFormatter,
		results: [],
		message: 'ALTER USER statement',
		excerpt: "'ALTER USER' should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	dropTable: {
		matcher: /^DROP TABLE IF EXISTS `?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => results[ 1 ],
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'DROP TABLE',
		excerpt: "'DROP TABLE IF EXISTS' should be present (case-insensitive)",
		recommendation: 'Check import settings to include DROP TABLE statements',
	},
	createTable: {
		matcher: /^CREATE TABLE (?:IF NOT EXISTS )?`?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => results[ 1 ],
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'CREATE TABLE',
		excerpt: "'CREATE TABLE' should be present (case-insensitive)",
		recommendation: 'Check import settings to include CREATE TABLE statements',
	},
	siteHomeUrl: {
		matcher: "'(siteurl|home)',\\s?'(.*?)'",
		matchHandler: ( lineNumber, results ) => results[ 0 ],
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
		excerpt: "'ENGINE=InnoDB' should be present (case-insensitive) for all tables",
		recommendation:
			"Ensure your application works with InnoDB and update your SQL dump to include only 'ENGINE=InnoDB' engine definitions in 'CREATE TABLE' statements. " +
		"We suggest you search for all 'ENGINE=X' entries and replace them with 'ENGINE=InnoDB'!",
	},
};

export const postValidation = async ( filename: string, isImport: boolean = false ) => {
	await trackEvent( 'import_validate_sql_command_execute', { is_import: isImport } );

	if ( ! isImport ) {
		log( `Finished processing ${ lineNum } lines.` );
		console.log( '\n' );
	}

	const errorSummary = {};
	const checkEntries: any = Object.entries( checks );

	let formattedErrors = [];
	let formattedInfos = [];

	for ( const [ type, check ]: [ string, CheckType ] of checkEntries ) {
		const formattedOutput = check.outputFormatter( check, type, isImport );

		formattedErrors = formattedErrors.concat( formattedOutput.errors );
		formattedInfos = formattedInfos.concat( formattedOutput.infos );

		errorSummary[ type ] = check.results.length;
	}
	// eslint-disable-next-line camelcase
	errorSummary.problems_found = problemsFound;

	if ( problemsFound > 0 ) {
		await trackEvent( 'import_validate_sql_command_failure', {
			is_import: isImport,
			error: errorSummary,
		} );

		const errorOutput = [
			`SQL validation failed due to ${ chalk.red( problemsFound ) } error(s)`,
			'',
		];

		formattedErrors.forEach( error => {
			errorOutput.push( error.error );

			if ( error.recommendation ) {
				errorOutput.push( error.recommendation );
			}

			errorOutput.push( '' );
		} );

		if ( isImport ) {
			throw new Error( errorOutput.join( '\n' ) );
		}

		console.error( errorOutput.join( '\n' ) );

		return process.exit( 1 );
	}

	if ( ! isImport ) {
		console.log( formattedInfos.join( '\n' ) );
		console.log( '' );
	}

	await trackEvent( 'import_validate_sql_command_success', { is_import: isImport } );
};

export const getTableNames = () => {
	return tableNames;
};

const checkForTableName = line => {
	const matches = line.match( /(?<=^CREATE\sTABLE\s)`?(?:(wp_[\d+_]?\w+))`?/ );
	if ( matches ) {
		const tableName = matches[ 1 ];
		// we should only have one match if we have any since we're looking at the start of the string
		tableNames.push( tableName );
	}
};

const perLineValidations = ( line: string, runAsImport: boolean ) => {
	if ( lineNum % 500 === 0 ) {
		runAsImport ? '' : log( `Reading line ${ lineNum } ` );
	}

	checkForTableName( line );

	const checkValues: any = Object.values( checks );
	checkValues.forEach( ( check: CheckType ) => {
		const results = line.match( check.matcher );
		if ( results ) {
			check.results.push( check.matchHandler( lineNum, results ) );
		}
	} );
	lineNum += 1;
};

const execute = ( line: string, isImport: boolean = true ) => {
	perLineValidations( line, isImport );
};

const postLineExecutionProcessing = async ( {
	fileName,
	isImport,
}: PostLineExecutionProcessingParams ) => {
	await postValidation( fileName, isImport );
};

export const staticSqlValidations = {
	execute,
	postLineExecutionProcessing,
};

// For standalone SQL validations
export const validate = async ( filename: string, isImport: boolean = false ) => {
	const readInterface = await getReadInterface( filename );
	readInterface.on( 'line', line => {
		execute( line, isImport );
	} );

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );
	readInterface.close();

	await postLineExecutionProcessing( { filename, isImport } );
};
