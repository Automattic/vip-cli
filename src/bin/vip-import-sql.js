#!/usr/bin/env node

/**
 * External dependencies
 */
import gql from 'graphql-tag';
import columns from 'cli-columns';
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
	SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED,
} from '../lib/site-import/db-file-import';
import { importSqlCheckStatus } from '../lib/site-import/status';
import {
	checkFileAccess,
	getFileSize,
	getFileMeta,
	isFile,
	uploadImportSqlFileToS3,
} from '../lib/client-file-uploader';
import { trackEventWithEnv } from '../lib/tracker';
import { staticSqlValidations, getTableNames } from '../lib/validations/sql';
import { siteTypeValidations } from '../lib/validations/site-type';
import { searchAndReplace } from '../lib/search-and-replace';
import API from '../lib/api';
import * as exit from '../lib/cli/exit';
import { fileLineValidations } from '../lib/validations/line-by-line';
import { formatEnvironment, formatSearchReplaceValues, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import { isMultiSiteInSiteMeta } from '../lib/validations/is-multi-site';

const appQuery = `
	id,
	name,
	type,
	typeId
	organization { id, name },
	environments{
		id
		appId
		type
		name
		launched
		isK8sResident
		syncProgress { status }
		primaryDomain { name }
		importStatus {
			dbOperationInProgress
			importInProgress
		}
		wpSites {
			nodes {
				homeUrl
				id
			}
		}
	}
`;

const START_IMPORT_MUTATION = gql`
	mutation StartImport($input: AppEnvironmentImportInput) {
		startImport(input: $input) {
			app {
				id
				name
			}
			message
			success
		}
	}
`;

const debug = debugLib( '@automattic/vip:bin:vip-import-sql' );

const SQL_IMPORT_PREFLIGHT_PROGRESS_STEPS = [
	{ id: 'replace', name: 'Performing Search and Replace' },
	{ id: 'upload', name: 'Uploading file' },
	{ id: 'queue_import', name: 'Queueing Import' },
];

/**
 * @param {AppForImport} app
 * @param {EnvForImport} env
 * @param {string} fileName
 */
export async function gates( app, env, fileName ) {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	if ( ! currentUserCanImportForApp( app ) ) {
		await track( 'import_sql_command_error', { error_type: 'unauthorized' } );
		exit.withError(
			'The currently authenticated account does not have permission to perform a SQL import.'
		);
	}

	if ( ! isSupportedApp( app ) ) {
		await track( 'import_sql_command_error', { error_type: 'unsupported-app' } );
		exit.withError(
			'The type of application you specified does not currently support SQL imports.'
		);
	}

	try {
		await checkFileAccess( fileName );
	} catch ( err ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-unreadable' } );
		exit.withError( `File '${ fileName }' does not exist or is not readable.` );
	}

	if ( ! ( await isFile( fileName ) ) ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-notfile' } );
		exit.withError( `Path '${ fileName }' is not a file.` );
	}

	const fileSize = await getFileSize( fileName );

	if ( ! fileSize ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-empty' } );
		exit.withError( `File '${ fileName }' is empty.` );
	}

	const maxFileSize = env?.launched
		? SQL_IMPORT_FILE_SIZE_LIMIT_LAUNCHED
		: SQL_IMPORT_FILE_SIZE_LIMIT;

	if ( fileSize > maxFileSize ) {
		await track( 'import_sql_command_error', {
			error_type: 'sqlfile-toobig',
			file_size: fileSize,
			launched: !! env?.launched,
		} );
		exit.withError(
			`The sql import file size (${ fileSize } bytes) exceeds the limit (${ maxFileSize } bytes).` +
				( env.launched
					? ' Note: This limit is lower for launched environments to maintain site stability.'
					: '' ) +
				'\n\nPlease split it into multiple files or contact support for assistance.'
		);
	}

	if ( ! env?.importStatus ) {
		await track( 'import_sql_command_error', { error_type: 'empty-import-status' } );
		exit.withError(
			'Could not determine the import status for this environment. Check the app/environment and if the problem persists, contact support for assistance'
		);
	}
	const {
		importStatus: { dbOperationInProgress, importInProgress },
	} = env;

	if ( importInProgress ) {
		await track( 'import_sql_command_error', { error_type: 'existing-import' } );
		exit.withError(
			'There is already an import in progress.\n\nYou can view the status with command:\n    vip import sql status'
		);
	}

	if ( dbOperationInProgress ) {
		await track( 'import_sql_command_error', { error_type: 'existing-dbop' } );
		exit.withError( 'There is already a database operation in progress. Please try again later.' );
	}
}

// Command examples for the `vip import sql` help prompt
const examples = [
	// `sql` subcommand
	{
		usage: 'vip import sql @mysite.develop file.sql',
		description: 'Import the given SQL file to your site',
	},
	// `search-replace` flag
	{
		usage:
			'vip import sql @mysite.develop file.sql --search-replace="https://from.example.com,https://to.example.com"',
		description:
			'Perform a Search and Replace, then import the replaced file to your site.\n' +
			'       * Ensure there are no spaces between your search-replace parameters',
	},
	// `search-replace` flag
	{
		usage:
			'vip import sql @mysite.develop file.sql --search-replace="https://from.example.com,https://to.example.com" --search-replace="example.com/from,example.com/to"',
		description:
			'Perform multiple search and replace tasks, then import the updated file to your site.',
	},
	// `in-place` flag
	{
		usage:
			'vip import sql @mysite.develop file.sql --search-replace="https://from.example.com,https://to.example.com" --in-place',
		description:
			'Search and Replace on the input `file.sql`, then import the updated file to your site',
	},
	// `output` flag
	{
		usage:
			'vip import sql @mysite.develop file.sql --search-replace="https://from.example.com,https://to.example.com" --output="output.sql"',
		description:
			'Output the performed Search and Replace to the specified output file, then import the replaced file to your site\n' +
			'       * Has no effect when the `in-place` flag is used',
	},
	// `sql status` subcommand
	{
		usage: 'vip import sql status @mysite.develop',
		description:
			'Check the status of the most recent import. If an import is running, this will poll until it is complete.',
	},
];

const promptToContinue = async ( { launched, formattedEnvironment, track, domain } ) => {
	console.log();
	const promptToMatch = domain.toUpperCase();
	const promptResponse = await prompt( {
		type: 'input',
		name: 'confirmedDomain',
		message: `You are about to import the above tables into a ${
			launched ? 'launched' : 'un-launched'
		} ${ formattedEnvironment } site ${ chalk.yellow( domain ) }.\nType '${ chalk.yellow(
			promptToMatch
		) }' (without the quotes) to continue:\n`,
	} );

	if ( promptResponse.confirmedDomain !== promptToMatch ) {
		await track( 'import_sql_unexpected_tables' );
		exit.withError( 'The input did not match the expected environment label. Import aborted.' );
	}
};

/**
 * @returns {Promise<string[]>}
 */
export async function validateAndGetTableNames( {
	skipValidate,
	appId,
	envId,
	fileNameToUpload,
	searchReplace,
} ) {
	const validations = [ staticSqlValidations, siteTypeValidations ];
	if ( skipValidate ) {
		console.log( 'Skipping SQL file validation.' );
		return [];
	}
	try {
		await fileLineValidations( appId, envId, fileNameToUpload, validations, searchReplace );
	} catch ( validateErr ) {
		console.log( '' );
		exit.withError( `${ validateErr.message }\n
If you are confident the file does not contain unsupported statements, you can retry the command with the ${ chalk.yellow(
			'--skip-validate'
		) } option.
` );
	}
	// this can only be called after static validation of the SQL file
	return getTableNames();
}

function validateFilename( filename ) {
	const re = /^[a-z0-9\-_.]+$/i;

	// Exits if filename contains anything outside a-z A-Z - _ .
	if ( ! re.test( filename ) ) {
		exit.withError(
			'Error: The characters used in the name of a file for import are limited to [0-9,a-z,A-Z,-,_,.]'
		);
	}
}

const displayPlaybook = ( {
	launched,
	tableNames,
	searchReplace,
	fileName,
	domain,
	formattedEnvironment,
	unformattedEnvironment,
	isMultiSite,
	app,
} ) => {
	console.log();
	console.log( `  importing: ${ chalk.blueBright( fileName ) }` );
	console.log( `         to: ${ chalk.cyan( domain ) }` );
	console.log( `       site: ${ app.name } (${ formattedEnvironment })` );

	if ( searchReplace?.length ) {
		const output = ( from, to ) => {
			const message = `        s-r: ${ chalk.blue( from ) } -> ${ chalk.blue( to ) }`;
			console.log( message );
		};

		formatSearchReplaceValues( searchReplace, output );
	}

	let siteArray = [];
	if ( isMultiSite ) {
		// eslint-disable-next-line no-multi-spaces
		console.log( `  multisite: ${ isMultiSite.toString() }` );
		const selectedEnvironmentObj = app?.environments?.find(
			env => unformattedEnvironment === env.type
		);
		siteArray = selectedEnvironmentObj?.wpSites?.nodes;
	}

	if ( ! tableNames.length ) {
		debug( 'Validation was skipped, no playbook information will be displayed' );
	} else {
		// output the table names
		console.log();
		if ( ! isMultiSite ) {
			console.log( 'Below are a list of Tables that will be imported by this process:' );
			console.log( columns( tableNames ) );
		} else {
			// we have siteArray from the API, use it and the table names together
			if ( siteArray === 'undefined' || ! siteArray ) {
				console.log(
					chalk.yellowBright(
						'Unable to determine the subsites affected by this import, please proceed only if you are confident on the contents in the import file.'
					)
				);
				return;
			} else if ( ! siteArray?.length ) {
				throw new Error( 'There were no sites in your multisite installation' );
			}

			const multiSiteBreakdown = siteArray.map( wpSite => {
				let siteRegex;
				if ( wpSite.id === 1 ) {
					siteRegex = /^wp_[a-z]+/i;
				} else {
					// eslint-disable-next-line security/detect-non-literal-regexp
					siteRegex = new RegExp( `^wp_${ parseInt( wpSite.id, 10 ) }_[a-z]+`, 'i' );
				}
				const tableNamesInGroup = tableNames.filter( name => siteRegex.test( name ) );
				return {
					id: wpSite.id,
					url: wpSite.homeUrl,
					tables: tableNamesInGroup,
				};
			} );

			if ( launched ) {
				console.log(
					chalk.yellowBright(
						'You are updating tables in a launched multi site installation. Sites in the same network may have their performance impacted by this operation.'
					)
				);
			}
			console.log( chalk.yellow( 'The following sites will be affected by the import:' ) );
			multiSiteBreakdown.forEach( siteObject => {
				console.log();
				console.log(
					chalk.blueBright(
						`Blog with ID ${ siteObject.id } and URL ${ siteObject.url } will import the following tables:`
					)
				);
				console.log( columns( siteObject.tables ) );
			} );
		}
	}
};

void command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	module: 'import-sql',
} )
	.command( 'status', 'Check the status of the current running import' )
	.option(
		'skip-validate',
		'Do not perform pre-upload file validation. If unsupported entries are present, the import is likely to fail'
	)
	.option(
		'search-replace',
		'Search for a given URL in the SQL file and replace it with another. The format for the value is `<from-url>,<to-url>` (e.g. --search-replace="https://from.com,https://to.com"'
	)
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option(
		'output',
		'Specify the replacement output file for Search and Replace',
		'process.stdout'
	)
	.examples( examples )
	.argv( process.argv, async ( arg, opts ) => {
		const { app, env } = opts;
		let { skipValidate, searchReplace } = opts;
		const { id: envId, appId } = env;
		const [ fileName ] = arg;
		const isMultiSite = await isMultiSiteInSiteMeta( appId, envId );
		let fileMeta = await getFileMeta( fileName );

		if ( fileMeta.isCompressed ) {
			console.log(
				chalk.yellowBright(
					'You are importing a compressed file. Validation and search-replace operation will be skipped.'
				)
			);

			skipValidate = true;
			searchReplace = undefined;
		}

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		const track = trackEventWithEnv.bind( null, appId, envId );

		await track( 'import_sql_command_execute' );

		// // halt operation of the import based on some rules
		await gates( app, env, fileName );

		// Log summary of import details
		const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;
		const formattedEnvironment = formatEnvironment( opts.env.type );
		const launched = opts.env.launched;

		// Extract base file name and exit if it contains unsafe character
		validateFilename( fileMeta.basename );

		let fileNameToUpload = fileName;

		// SQL file validations
		const tableNames = await validateAndGetTableNames( {
			skipValidate,
			appId,
			envId,
			fileNameToUpload,
			searchReplace,
		} );

		// display playbook of what will happen during execution
		displayPlaybook( {
			launched,
			tableNames,
			searchReplace,
			fileName,
			domain,
			formattedEnvironment,
			unformattedEnvironment: opts.env.type,
			isMultiSite,
			app,
		} );

		// PROMPT TO PROCEED WITH THE IMPORT
		await promptToContinue( {
			launched,
			formattedEnvironment,
			track,
			domain,
		} );

		/**
		 * =========== WARNING =============
		 *
		 * NO `console.log` after this point!
		 * Yes, even inside called functions.
		 * It will break the progress printing.
		 *
		 * =========== WARNING =============
		 */
		const progressTracker = new ProgressTracker( SQL_IMPORT_PREFLIGHT_PROGRESS_STEPS );

		let status = 'running';

		const setProgressTrackerPrefixAndSuffix = () => {
			progressTracker.prefix = `
=============================================================
Processing the SQL import for your environment...
`;
			progressTracker.suffix = `\n${ getGlyphForStatus( status, progressTracker.runningSprite ) } ${
				status === 'running' ? 'Loading remaining steps' : ''
			}`; // TODO: maybe use progress tracker status
		};

		const failWithError = failureError => {
			status = 'failed';
			setProgressTrackerPrefixAndSuffix();
			progressTracker.stopPrinting();
			progressTracker.print( { clearAfter: true } );

			exit.withError( failureError );
		};

		progressTracker.startPrinting( setProgressTrackerPrefixAndSuffix );

		// Run Search and Replace if the --search-replace flag was provided
		if ( searchReplace && searchReplace.length ) {
			progressTracker.stepRunning( 'replace' );

			const { outputFileName } = await searchAndReplace( fileName, searchReplace, {
				isImport: true,
				inPlace: opts.inPlace,
				output: true,
			} );

			if ( typeof outputFileName !== 'string' ) {
				progressTracker.stepFailed( 'replace' );
				return failWithError(
					'Unable to determine location of the intermediate search & replace file.'
				);
			}

			fileNameToUpload = outputFileName;
			fileMeta = await getFileMeta( fileNameToUpload );

			progressTracker.stepSuccess( 'replace' );
		} else {
			progressTracker.stepSkipped( 'replace' );
		}

		progressTracker.stepRunning( 'upload' );

		// Call the Public API
		const api = await API();

		const startImportVariables = {};

		const progressCallback = percentage => {
			progressTracker.setUploadPercentage( percentage );
		};

		fileMeta.fileName = fileNameToUpload;

		try {
			const {
				fileMeta: { basename },
				md5,
				result,
			} = await uploadImportSqlFileToS3( {
				app,
				env,
				fileMeta,
				progressCallback,
			} );

			startImportVariables.input = {
				id: app.id,
				environmentId: env.id,
				basename,
				md5,
				searchReplace: [],
			};

			if ( searchReplace ) {
				let pairs = searchReplace;
				if ( ! Array.isArray( pairs ) ) {
					pairs = [ searchReplace ];
				}

				// determine all the replacements required
				const replacementsArr = pairs.map( pair => pair.split( ',' ).map( str => str.trim() ) );

				startImportVariables.input.searchReplace = replacementsArr.map( arr => {
					return {
						from: arr[ 0 ],
						to: arr[ 1 ],
					};
				} );
			}

			debug( { basename, md5, result, startImportVariables } );
			debug( 'Upload complete. Initiating the import.' );
			progressTracker.stepSuccess( 'upload' );
			await track( 'import_sql_upload_complete' );
		} catch ( uploadError ) {
			await track( 'import_sql_command_error', {
				error_type: 'upload_failed',
				upload_error: uploadError.message,
			} );

			progressTracker.stepFailed( 'upload' );
			return failWithError( uploadError );
		}

		// Start the import
		try {
			const startImportResults = await api.mutate( {
				mutation: START_IMPORT_MUTATION,
				variables: startImportVariables,
			} );

			debug( { startImportResults } );
		} catch ( gqlErr ) {
			progressTracker.stepFailed( 'queue_import' );

			await track( 'import_sql_command_error', {
				error_type: 'StartImport-failed',
				gql_err: gqlErr,
			} );

			progressTracker.stepFailed( 'queue_import' );
			return failWithError( `StartImport call failed: ${ gqlErr }` );
		}

		progressTracker.stepSuccess( 'queue_import' );

		await importSqlCheckStatus( { app, env, progressTracker } );
	} );
