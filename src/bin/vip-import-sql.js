#!/usr/bin/env node

/**
 * @flow
 * @format
 */

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
import command from 'lib/cli/command';
import {
	currentUserCanImportForApp,
	isSupportedApp,
	SQL_IMPORT_FILE_SIZE_LIMIT,
} from 'lib/site-import/db-file-import';
// eslint-disable-next-line no-duplicate-imports
import type { AppForImport, EnvForImport } from 'lib/site-import/db-file-import';
import { importSqlCheckStatus } from 'lib/site-import/status';
import { checkFileAccess, getFileSize, uploadImportSqlFileToS3 } from 'lib/client-file-uploader';
import { trackEventWithEnv } from 'lib/tracker';
import { staticSqlValidations, getTableNames } from 'lib/validations/sql';
import { siteTypeValidations } from 'lib/validations/site-type';
import { searchAndReplace } from 'lib/search-and-replace';
import API from 'lib/api';
import * as exit from 'lib/cli/exit';
import { fileLineValidations } from 'lib/validations/line-by-line';
import { formatEnvironment, formatSearchReplaceValues, getGlyphForStatus } from 'lib/cli/format';
import { ProgressTracker } from 'lib/cli/progress';
import { isFile } from '../lib/client-file-uploader';
import { isMultiSiteInSiteMeta } from 'lib/validations/is-multi-site';
import { exitWhenFeatureDisabled } from '../lib/cli/apiConfig';

export type WPSiteListType = {
	id: string,
	homeUrl: string,
};

const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		id
		appId
		type
		name
		launched
		syncProgress { status }
		primaryDomain { name }
		importStatus {
			dbOperationInProgress
			importInProgress
		}
	}
`;

const GET_WP_SITE_LIST = gql`
	query getWpSites($appId: Int) {
		app(id: $appId) {
			environments {
				wpSites {
					nodes {
						homeUrl
						id
					}
				}
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

const debug = debugLib( 'vip:vip-import-sql' );

const SQL_IMPORT_PREFLIGHT_PROGRESS_STEPS = [
	{ id: 'replace', name: 'Performing Search and Replace' },
	{ id: 'validate', name: 'Validating SQL' },
	{ id: 'upload', name: 'Uploading file' },
	{ id: 'queue_import', name: 'Queueing Import' },
];

export async function gates( app: AppForImport, env: EnvForImport, fileName: string ) {
	const { id: envId, appId } = env;
	const track = trackEventWithEnv.bind( null, appId, envId );

	// Block multiSite imports unless feature is enabled
	if ( await isMultiSiteInSiteMeta( appId, envId ) ) {
		// currently checks isVIP
		exitWhenFeatureDisabled( 'subsite-sql-imports' );
	}

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
	} catch ( e ) {
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

	if ( fileSize > SQL_IMPORT_FILE_SIZE_LIMIT ) {
		await track( 'import_sql_command_error', { error_type: 'sqlfile-toobig' } );
		exit.withError(
			`The sql import file size (${ fileSize } bytes) exceeds the limit (${ SQL_IMPORT_FILE_SIZE_LIMIT } bytes).` +
				'Please split it into multiple files or contact support for assistance.'
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
		usage: 'vip import sql @mysite.develop <file.sql>',
		description: 'Import the given SQL file to your site',
	},
	// `search-replace` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to"',
		description:
			'Perform a Search and Replace, then import the replaced file to your site.\n' +
			'       * Ensure there are no spaces between your search-replace parameters',
	},
	// `in-place` flag
	{
		usage: 'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --in-place',
		description:
			'Search and Replace on the input <file.sql>, then import the replaced file to your site',
	},
	// `output` flag
	{
		usage:
			'vip import sql @mysite.develop <file.sql> --search-replace="from,to" --output="<output.sql>"',
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

const promptToContinue = async ( {
	launched,
	formattedEnvironment,
	unFormattedEnvironment,
	track,
} ): Promise<void> => {
	console.log();
	const promptResponse = await prompt( {
		type: 'input',
		name: 'confirmedEnvironment',
		message: `You are about to import the above tables into a ${
			launched ? 'launched' : 'un-launched'
		} ${ formattedEnvironment } site. Type '${ formattedEnvironment }' to continue`,
	} );

	if ( promptResponse.confirmedEnvironment !== unFormattedEnvironment ) {
		await track( 'import_sql_unexpected_tables' );
		exit.withError( 'Please review the contents of your SQL dump' );
	}
};

export type validationsAndGetTableNamesInputType = {
	skipValidate: boolean,
	appId: number,
	envId: number,
	fileNameToUpload: string,
};

export async function validationsAndGetTableNames( {
	skipValidate,
	appId,
	envId,
	fileNameToUpload,
}: validationsAndGetTableNamesInputType ): Promise<Array<string>> {
	const validations = [ staticSqlValidations, siteTypeValidations ];
	let tableNamesInSqlFile = [];
	if ( skipValidate ) {
		console.log( 'Skipping SQL file validation.' );
	} else {
		try {
			await fileLineValidations( appId, envId, fileNameToUpload, validations );
		} catch ( validateErr ) {
			console.log( '' );
			exit.withError( `${ validateErr.message }

If you are confident the file does not contain unsupported statements, you can retry the command with the ${ chalk.yellow(
		'--skip-validate'
	) } option.
` );
		}
		// this can only be called after static validation of the SQL file
		tableNamesInSqlFile = getTableNames();
	}
	return tableNamesInSqlFile;
}

const getMultiSiteList = async ( { env, track } ): Promise<Array<WPSiteListType>> => {
	let wpSiteListResults;
	// get blog_ids from wpcli
	const api = await API();
	try {
		const inputs = {
			appId: env.appId,
		};
		debug( inputs );
		wpSiteListResults = await api.query( {
			query: GET_WP_SITE_LIST,
			variables: inputs,
		} );
	} catch ( gqlErr ) {
		await track( 'import_sql_command_error', {
			error_type: 'SiteListResults-failed',
			gql_err: gqlErr,
		} );

		exit.withError( `wp site list call failed: ${ gqlErr }` );
	}

	let siteArray = [];
	if ( Array.isArray( wpSiteListResults?.data?.app?.environments[ 0 ]?.wpSites?.nodes ) ) {
		siteArray = wpSiteListResults.data?.app.environments[ 0 ].wpSites.nodes;
	}
	debug( 'multiSiteArray', siteArray );
	return siteArray;
};

const displayPlaybook = async ( {
	launched,
	tableNames,
	searchReplace,
	fileName,
	domain,
	formattedEnvironment,
	isMultiSite,
	app,
	env,
	track,
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
		console.log( `multisite: ${ isMultiSite.toString() }` );
		siteArray = await getMultiSiteList( { env, track } );
	}

	if ( ! tableNames.length ) {
		console.log();
		console.log( 'Since validation was skipped, no playbook information could be displayed' );
	} else {
		// output the table names
		console.log();
		if ( ! isMultiSite ) {
			console.log( 'Below are a list of Tables that will be imported by this process:' );
			console.log( columns( tableNames ) );
		} else {
			// we have siteArray from the API, use it and the table names together
			if ( ! siteArray.length ) {
				throw new Error( 'There were no sites in your multisite installation' );
			}

			const multiSiteBreakdown = siteArray.map( wpSite => {
				let siteRegex;
				if ( wpSite.id === 1 ) {
					siteRegex = /wp_[a-z]+/i;
				} else {
					siteRegex = new RegExp( `wp_${ wpSite.id }_[a-z]+`, 'i' );
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
			multiSiteBreakdown.map( siteObject => {
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

command( {
	appContext: true,
	appQuery,
	envContext: true,
	requiredArgs: 1,
	module: 'import-sql',
	requireConfirm: 'Are you sure you want to import the contents of the provided SQL file?',
	skipConfirmPrompt: true,
} )
	.command( 'status', 'Check the status of the current running import' )
	.option(
		'skip-validate',
		'Do not perform pre-upload file validation. If unsupported entries are present, the import is likely to fail'
	)
	.option( 'search-replace', 'Perform Search and Replace on the specified SQL file' )
	.option( 'in-place', 'Search and Replace explicitly on the given input file' )
	.option(
		'output',
		'Specify the replacement output file for Search and Replace',
		'process.stdout'
	)
	.examples( examples )
	.argv( process.argv, async ( arg: string[], opts ) => {
		const { app, env, searchReplace, skipValidate } = opts;
		const { id: envId, appId } = env;
		const [ fileName ] = arg;
		const isMultiSite = await isMultiSiteInSiteMeta( appId, envId );

		debug( 'Options: ', opts );
		debug( 'Args: ', arg );

		const track = trackEventWithEnv.bind( null, appId, envId );

		await track( 'import_sql_command_execute' );

		// // halt operation of the import based on some rules
		await gates( app, env, fileName );

		// Log summary of import details
		const domain = env?.primaryDomain?.name ? env.primaryDomain.name : `#${ env.id }`;
		const unFormattedEnvironment = opts.env.type.toLowerCase();
		const formattedEnvironment = formatEnvironment( opts.env.type );
		const launched = opts.env.launched;

		let fileNameToUpload = fileName;

		// SQL file validations
		const tableNames = await validationsAndGetTableNames( {
			skipValidate,
			appId,
			envId,
			fileNameToUpload,
		} );

		// display playbook of what will happen during execution
		await displayPlaybook( {
			launched,
			tableNames,
			searchReplace,
			fileName,
			domain,
			formattedEnvironment,
			isMultiSite,
			app,
			env,
			track,
		} );

		// PROMPT TO PROCEED WITH THE IMPORT
		await promptToContinue( { launched, formattedEnvironment, unFormattedEnvironment, track } );

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

		try {
			const {
				fileMeta: { basename, md5 },
				result,
			} = await uploadImportSqlFileToS3( {
				app,
				env,
				fileName: fileNameToUpload,
				progressCallback,
			} );

			startImportVariables.input = {
				id: app.id,
				environmentId: env.id,
				basename: basename,
				md5: md5,
			};

			debug( { basename, md5, result } );
			debug( 'Upload complete. Initiating the import.' );
			progressTracker.stepSuccess( 'upload' );
			await track( 'import_sql_upload_complete' );
		} catch ( uploadError ) {
			await track( 'import_sql_command_error', { error_type: 'upload_failed', uploadError } );

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
