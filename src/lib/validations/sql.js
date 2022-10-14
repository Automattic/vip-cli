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
import * as exit from 'lib/cli/exit';
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

function formatWarning( message ) {
	return `${ chalk.yellow( 'Warning:' ) } ${ message }`;
}

function formatRecommendation( message ) {
	return `${ chalk.yellow( 'Recommendation:' ) } ${ message }`;
}

export type CheckResult = {
	lineNumber?: number,
	text?: string,
	recomendation?: string,
	falsePositive?: boolean,
	warning?: boolean,
}

export type CheckType = {
	excerpt: string,
	matchHandler: ( lineNumber: number, result: any, extraParam: any ) => CheckResult,
	matcher: RegExp | string,
	message: string,
	outputFormatter: Function,
	recommendation: string,
	results: Array<CheckResult>,
};

export type Checks = {
	trigger: CheckType,
	dropDB: CheckType,
	alterUser: CheckType,
	dropTable: CheckType,
	createTable: CheckType,
	siteHomeUrl: CheckType,
};

interface ValidationOptions {
	isImport: boolean,
	skipChecks: string[],
	extraCheckParams: Record<string, any>,
}

const generalCheckFormatter = ( check: CheckType ) => {
	const errors = [];
	const infos = [];

	const validProblems = check.results.filter( result => ! result.falsePositive );
	if ( validProblems.length > 0 ) {
		if ( validProblems.some( result => ! result.warning ) ) {
			problemsFound += 1;
		}

		for ( const problem of validProblems ) {
			const text = `${ problem.text || check.message } on line ${ problem.lineNumber || '' }.`;
			if ( problem.warning ) {
				errors.push( {
					warning: formatWarning( text ),
					recommendation: formatRecommendation( problem.recomendation || check.recommendation ),
				} );
			} else {
				errors.push( {
					error: formatError( text ),
					recommendation: formatRecommendation( problem.recomendation || check.recommendation ),
				} );
			}
		}
	} else {
		infos.push( `✅ ${ check.message } was found 0 times.` );
	}

	return {
		errors,
		infos,
	};
};

const lineNumberCheckFormatter = ( check: CheckType ) => {
	const errors = [];
	const infos = [];

	if ( check.results.length > 0 ) {
		problemsFound += 1;
		const lineNumbers = check.results.map( result => result.lineNumber );
		errors.push( {
			error: formatError( `${ check.message } on line(s) ${ lineNumbers.join( ', ' ) }.` ),
			recommendation: formatRecommendation( check.recommendation ),
		} );
	} else {
		infos.push( `✅ ${ check.message } was found 0 times.` );
	}

	return {
		errors,
		infos,
	};
};

const requiredCheckFormatter = ( check: CheckType, type, isImport ) => {
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

const infoCheckFormatter = ( check: CheckType ) => {
	const infos = [];

	check.results.forEach( item => {
		infos.push( item.text );
	} );

	return {
		errors: [],
		infos,
	};
};

function checkTablePrefixes( results: CheckResult[], errors, infos ) {
	const wpTables = [],
		notWPTables = [],
		wpMultisiteTables = [];
	results.forEach( result => {
		const tableName = result.text || '';
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

const checks: Checks = {
	binaryLogging: {
		matcher: /SET @@SESSION.sql_log_bin/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'SET @@SESSION.sql_log_bin statement',
		excerpt: "'SET @@SESSION.sql_log_bin' statement should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	trigger: {
		// Match `CREATE (DEFINER=`root`@`host`) TRIGGER`
		matcher: /^CREATE (\(?DEFINER=`?(\w*)(`@`)?(\w*\.*%?)*`?\)?)?(| )TRIGGER/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'TRIGGER statement',
		excerpt: "'TRIGGER' statement should not be present (case-sensitive)",
		recommendation: 'Remove these lines',
	},
	dropDB: {
		matcher: /^DROP DATABASE/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'DROP DATABASE statement',
		excerpt: "'DROP DATABASE' should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	useStatement: {
		matcher: /^USE /i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'USE <DATABASE_NAME> statement',
		excerpt: "'USE <DATABASE_NAME>' should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	alterUser: {
		matcher: /^(ALTER USER|SET PASSWORD)/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'ALTER USER statement',
		excerpt: "'ALTER USER' should not be present (case-insensitive)",
		recommendation: 'Remove these lines',
	},
	dropTable: {
		matcher: /^DROP TABLE IF EXISTS `?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => ( { text: results[ 1 ] } ),
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'DROP TABLE',
		excerpt: "'DROP TABLE IF EXISTS' should be present (case-insensitive)",
		recommendation: 'Check import settings to include DROP TABLE statements',
	},
	createTable: {
		matcher: /^CREATE TABLE (?:IF NOT EXISTS )?`?([a-z0-9_]*)/i,
		matchHandler: ( lineNumber, results ) => ( { text: results[ 1 ] } ),
		outputFormatter: requiredCheckFormatter,
		results: [],
		message: 'CREATE TABLE',
		excerpt: "'CREATE TABLE' should be present (case-insensitive)",
		recommendation: 'Check import settings to include CREATE TABLE statements',
	},
	alterTable: {
		matcher: /^ALTER TABLE `?([a-z0-9_]*)/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'ALTER TABLE statement',
		excerpt: "'ALTER TABLE' should not be present (case-insensitive)",
		recommendation: 'Remove these lines and define table structure in the CREATE TABLE statement instead',
	},
	uniqueChecks: {
		matcher: /^SET UNIQUE_CHECKS\s*=\s*0/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'SET UNIQUE_CHECKS = 0',
		excerpt: "'SET UNIQUE_CHECKS = 0' should not be present",
		recommendation: "'UNIQUE_CHECKS' cannot not be disabled. These lines should be removed",
	},
	siteHomeUrl: {
		matcher: "'(siteurl|home)',\\s?'(.*?)'",
		matchHandler: ( lineNumber, results ) => ( { text: results[ 1 ] } ),
		outputFormatter: infoCheckFormatter,
		results: [],
		message: 'Siteurl/home matches',
		excerpt: 'Siteurl/home options',
		recommendation: '',
	},
	siteHomeUrlLando: {
		matcher: "'(siteurl|home)',\\s?'(.*?)'",
		matchHandler: ( lineNumber, results, expectedDomain ) => {
			const foundDomain = results[ 2 ].replace( /https?:\/\//, '' );
			if ( ! foundDomain.trim() ) {
				return { falsePositive: true };
			}
			if ( foundDomain.includes( expectedDomain ) ) {
				return { falsePositive: true };
			}
			return {
				warning: true,
				lineNumber,
				recomendation: `Use '--search-replace="${ foundDomain },${ expectedDomain }"' switch to replace the domain`,
			};
		},
		outputFormatter: generalCheckFormatter,
		results: [],
		message: 'Siteurl/home options not pointing to lando domain',
		excerpt: 'Siteurl/home options not pointing to lando domain',
		recommendation: 'Use search-replace to change environment\'s domain',
	},
	engineInnoDB: {
		matcher: / ENGINE=(?!(InnoDB))/i,
		matchHandler: lineNumber => ( { lineNumber } ),
		outputFormatter: lineNumberCheckFormatter,
		results: [],
		message: 'ENGINE != InnoDB',
		excerpt: "'ENGINE=InnoDB' should be present (case-insensitive) for all tables",
		recommendation:
			"Ensure your application works with InnoDB and update your SQL dump to include only 'ENGINE=InnoDB' engine definitions in 'CREATE TABLE' statements. " +
			"We suggest you search for all 'ENGINE=X' entries and replace them with 'ENGINE=InnoDB'!",
	},
};
const DEV_ENV_SPECIFIC_CHECKS = [ 'useStatement', 'siteHomeUrlLando' ];

const postValidation = async ( options: ValidationOptions ) => {
	await trackEvent( 'import_validate_sql_command_execute', { is_import: options.isImport } );

	if ( ! options.isImport ) {
		log( `Finished processing ${ lineNum } lines.` );
		console.log( '\n' );
	}

	const errorSummary = {};
	const checkEntries: any = Object.entries( checks )
		.filter( ( [ type ] ) => ! options.skipChecks.includes( type ) );

	const formattedWarnings = [];
	let formattedErrors = [];
	let formattedInfos = [];

	for ( const [ type, check ]: [ string, CheckType ] of checkEntries ) {
		const formattedOutput = check.outputFormatter( check, type, options.isImport );

		for ( const error of formattedOutput.errors ) {
			if ( error.warning ) {
				formattedWarnings.push( error );
			} else {
				formattedErrors.push( error );
			}
		}
		formattedInfos = formattedInfos.concat( formattedOutput.infos );

		errorSummary[ type ] = check.results.length;
	}
	// eslint-disable-next-line camelcase
	errorSummary.problems_found = problemsFound;

	const tableNamesSet = new Set( tableNames );
	if ( tableNames.length > tableNamesSet.size ) {
		// there was a duplciate table
		problemsFound++;

		function findDuplicates( arr ) {
			const filtered = arr.filter( item => {
				if ( tableNamesSet.has( item ) ) {
					tableNamesSet.delete( item );
				} else {
					return item;
				}
			} );

			return [ ...new Set( filtered ) ];
		}

		const duplicates = findDuplicates( tableNames );

		const errorObject = {
			error: formatError( 'Duplicate table names were found: ' + duplicates.join( ',' ) ),
			recommendation: formatRecommendation( 'Ensure that there are no duplicate tables in your SQL dump' ),
		};
		formattedErrors = formattedErrors.concat( errorObject );
	}

	if ( formattedWarnings.length ) {
		const warningOutput = [];
		formattedWarnings.forEach( warning => {
			warningOutput.push( warning.warning );

			if ( warning.recommendation ) {
				warningOutput.push( warning.recommendation );
			}

			warningOutput.push( '' );
		} );
		console.log( warningOutput.join( '\n' ) );
		console.log( '' );
	}

	if ( problemsFound > 0 ) {
		await trackEvent( 'import_validate_sql_command_failure', {
			is_import: options.isImport,
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

		if ( options.isImport ) {
			throw new Error( errorOutput.join( '\n' ) );
		}

		exit.withError( errorOutput.join( '\n' ) );
	}

	if ( ! options.isImport ) {
		console.log( formattedInfos.join( '\n' ) );
		console.log( '' );
	}

	await trackEvent( 'import_validate_sql_command_success', { is_import: options.isImport } );
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

const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
	isImport: true,
	skipChecks: DEV_ENV_SPECIFIC_CHECKS,
	extraCheckParams: {},
};

const perLineValidations = ( line: string, options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS ) => {
	if ( lineNum % 500 === 0 ) {
		options.isImport ? '' : log( `Reading line ${ lineNum } ` );
	}

	checkForTableName( line );

	const checkKeys = Object.keys( checks ).filter( checkItem => ! options.skipChecks.includes( checkItem ) );
	for ( const checkKey of checkKeys ) {
		const check: CheckType = checks[ checkKey ];
		const results = line.match( check.matcher );
		const extraCheckParams = options.extraCheckParams[ checkKey ];
		if ( results ) {
			check.results.push( check.matchHandler( lineNum, results, extraCheckParams ) );
		}
	}

	lineNum += 1;
};

const postLineExecutionProcessing = async ( { isImport, skipChecks }: PostLineExecutionProcessingParams ) => {
	await postValidation( {
		isImport: isImport || false,
		skipChecks: skipChecks || DEV_ENV_SPECIFIC_CHECKS,
		extraCheckParams: {},
	} );
};

export const staticSqlValidations = {
	execute: perLineValidations,
	postLineExecutionProcessing,
};

// For standalone SQL validations
export const validate = async ( filename: string, options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS ) => {
	const readInterface = await getReadInterface( filename );
	options.isImport = false;
	readInterface.on( 'line', line => {
		perLineValidations( line, options );
	} );

	// Block until the processing completes
	await new Promise( resolve => readInterface.on( 'close', resolve ) );
	readInterface.close();

	await postLineExecutionProcessing( { isImport: options.isImport, skipChecks: options.skipChecks } );
};
