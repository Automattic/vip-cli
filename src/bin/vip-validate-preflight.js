#!/usr/bin/env node

import {
	Harmonia,
	SiteConfig,
	EnvironmentVariables,
	TestSuiteResult,
	TestResultType,
	IssueType,
} from '@automattic/vip-go-preflight-checks';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import { readFileSync } from 'fs';
import gql from 'graphql-tag';
import dotenv from 'ini';
import path from 'path';

import {
	default as API,
	enableGlobalGraphQLErrorHandling,
	disableGlobalGraphQLErrorHandling,
} from '../lib/api';
import command from '../lib/cli/command';
import { parseEnvAliasFromArgv } from '../lib/cli/envAlias';
import * as exit from '../lib/cli/exit';
import { trackEvent } from '../lib/tracker';

const ALLOWED_NODEJS_VERSIONS = [ '18', '20', '22' ];

export const appQuery = `
	id
	name
	repo
	environments {
		id
		appId
		name
		type
		environmentVariables {
			nodes {
				name,
				value
			}
		}
	}
	organization {
		id
		name
	}
`;

let suppressOutput = false;
let outputFormat = 'table';

let harmoniaArgs = [];

/**
 * @param {string[]} messages
 */
function logToConsole( ...messages ) {
	if ( suppressOutput ) {
		return;
	}

	if ( messages.length === 0 ) {
		messages = [ '' ];
	}

	messages.forEach( message => console.log( message ) );
}

async function getBuildConfiguration( application, environment ) {
	const api = API();

	// Disable the global GraphQL error handling, so we can catch Unauthorized errors and recommend next steps.
	disableGlobalGraphQLErrorHandling();

	const buildConfigQuery = gql`
		query BuildConfig($appId: Int, $envId: Int) {
			app(id: $appId) {
				environments(id: $envId) {
					id
					buildConfiguration {
						buildType
						nodeBuildDockerEnv
						nodeJSVersion
						npmToken
					}
				}
			}
		}
	`;

	try {
		const result = await api.query( {
			query: buildConfigQuery,
			fetchPolicy: 'network-only',
			variables: {
				appId: environment.appId,
				envId: environment.id,
			},
		} );

		// Reenable GraphQL error handling
		enableGlobalGraphQLErrorHandling();

		return result.data.app.environments[ 0 ].buildConfiguration;
	} catch ( error ) {
		if (
			error.graphQLErrors &&
			error.graphQLErrors.find( gqlError => gqlError.message === 'Unauthorized' )
		) {
			console.log(
				`${ chalk.red(
					'Error:'
				) } You do not have sufficient permissions to run validations for this environment.\n` +
					`You must be either be an admin of the ${ chalk.bold.underline(
						application.organization.name
					) } organization, or, alternatively,\n` +
					`a guest of that organization and an admin of the ${ chalk.bold.underline(
						application.name
					) } application.\n\n` +
					'Read more about organization and application roles in our documentation:\n' +
					chalk.underline( 'https://docs.wpvip.com/manage-user-access/vip-dashboard/' )
			);

			await trackEvent( 'validate_preflight_command_error', {
				env_id: environment.id,
				app_id: environment.appId,
				error: 'unauthorized',
			} );

			process.exit( 1 );
		} else {
			// Handle it elsewhere
			throw error;
		}
	}
}

/**
 * @param {string} argv
 */
export async function vipValidatePreflightCommand( arg, opt ) {
	harmoniaArgs = await validateArgs( opt );

	const appId = opt.env?.appId ?? 0;
	const envId = opt.env?.id ?? 0;

	const baseTrackingParams = {
		env_id: envId,
		app_id: appId,
		command: 'vip validate preflight',
		...sanitizeArgsForTracking( harmoniaArgs ),
	};

	await trackEvent( 'validate_preflight_command_execute', baseTrackingParams );

	logToConsole( '  /\\  /\\__ _ _ __ _ __ ___   ___  _ __ (_) __ _ ' );
	logToConsole( " / /_/ / _` | '__| '_ ` _ \\ / _ \\| '_ \\| |/ _` |" );
	logToConsole( '/ __  / (_| | |  | | | | | | (_) | | | | | (_| |' );
	logToConsole( '\\/ /_/ \\__,_|_|  |_| |_| |_|\\___/|_| |_|_|\\__,_|' );
	logToConsole( 'VIP Harmonia - Application testing made easy\n' );

	const harmonia = new Harmonia();
	harmonia.setSource( 'vip-cli' );

	if ( harmoniaArgs.buildType !== 'nodejs' ) {
		await trackEvent( 'validate_preflight_command_error', {
			...baseTrackingParams,
			error: 'not-nodejs',
		} );

		exit.withError( 'Currently, only Node.js applications are supported.' );
	}

	// Register the default tests.
	harmonia.registerDefaultTests();

	// Create the Site Config objects
	const siteOptions = new SiteConfig( {
		siteID: envId,
		nodejsVersion: harmoniaArgs.nodejsVersion,
		repository: opt.app?.repo ?? 'no-repo',
		baseURL: 'http://localhost:' + harmoniaArgs.port,
		dockerBuildEnvs: harmoniaArgs.nodeBuildDockerEnv,
		topRequests: [], // TODO: get top 10 of most requested URLs
		wait: harmoniaArgs.wait,
	} );

	// Get package.json
	const packageJSONfile = path.resolve( opt.path, 'package.json' );
	let packageJSON;
	try {
		// eslint-disable-next-line security/detect-non-literal-require
		packageJSON = require( packageJSONfile );
		siteOptions.setPackageJSON( packageJSON );
	} catch ( error ) {
		await trackEvent( 'validate_preflight_command_error', {
			...baseTrackingParams,
			error: 'missing-package-json',
		} );

		return exit.withError(
			`Could not find a 'package.json' in the current directory (${ opt.path }).`
		);
	}

	const customEnvVars = {};

	if ( opt.env?.environmentVariables?.nodes.length > 0 ) {
		opt.env.environmentVariables.nodes.forEach( envVar => {
			customEnvVars[ envVar.name ] = envVar.value;
		} );
	}

	// Create the EnviornmentVariables object
	const envVars = new EnvironmentVariables( {
		PORT: harmoniaArgs.port,
		...customEnvVars,
	} );

	// Add NPM_TOKEN environment variable, if present
	if ( harmoniaArgs.npmToken ) {
		envVars.set( 'NPM_TOKEN', harmoniaArgs.npmToken );
	}

	// Get from .env, if exists
	let dotenvOptions = {};
	try {
		const dotenvPath = path.resolve( opt.path, '.env' );
		const dotenvContent = readFileSync( dotenvPath );
		dotenvOptions = dotenv.parse( dotenvContent );
	} catch ( error ) {
		// nothing
	}

	// Save dotenv in the site config
	siteOptions.set( 'dotenv', dotenvOptions );

	// Bootstrap
	try {
		harmonia.bootstrap( siteOptions, envVars );
	} catch ( error ) {
		await trackEvent( 'validate_preflight_command_error', {
			...baseTrackingParams,
			error: error.message,
		} );
		return exit.withError( error.message );
	}

	setupEvents( harmonia );
	runHarmonia( harmonia );
}

/**
 * @param {Harmonia} harmonia
 */
function setupEvents( harmonia ) {
	// Register some events handlers
	harmonia.on( 'ready', () => {
		logToConsole( 'Harmonia is ready! ' );
	} );

	// Register the event handlers to output some information during the execution
	harmonia.on( 'beforeTestSuite', suite => {
		const description = suite.description ? `- ${ chalk.italic( suite.description ) }` : '';
		logToConsole( ` >> Running test suite ${ chalk.bold( suite.name ) } ${ description } ` );
		logToConsole();
	} );

	harmonia.on( 'beforeTest', test => {
		logToConsole( `  [ ${ chalk.bold( test.name ) } ] - ${ test.description }` );
	} );

	harmonia.on( 'afterTest', ( test, result ) => {
		switch ( result.getType() ) {
			case TestResultType.Success:
				logToConsole( `   ✅  ${ chalk.bgGreen( ' Test passed with no errors. ' ) }` );
				break;
			case TestResultType.Failed:
				logToConsole(
					`   ❌  ${ chalk.bgRed( ` Test failed with ${ result.getErrors().length } errors. ` ) }`
				);
				break;
			case TestResultType.PartialSuccess:
				logToConsole( `   ✅  ${ chalk.bgYellow( ' Test partially succeeded. ' ) }` );
				break;
			case TestResultType.Aborted:
				logToConsole(
					`   ❌  ${ chalk.bgRedBright.underline(
						' Test aborted! '
					) } - There was a critical error that makes`,
					'the application incompatible with the VIP Platform.'
				);
				break;
			case TestResultType.Skipped:
				logToConsole(
					`  ${ chalk.bgGrey.bold( ' Skipped ' ) }\t${ result.getLastNotice().message }`
				);
		}
		logToConsole();
	} );

	harmonia.on( 'afterTestSuite', ( test, result ) => {
		// Create a badge
		let badge;
		switch ( result.getType() ) {
			case TestResultType.Failed:
				badge = chalk.bgRed.bold( ' FAILED ' );
				break;
			case TestResultType.Aborted:
				badge = chalk.bgRedBright.underline.bold( ' ABORTED ' );
				break;
			case TestResultType.PartialSuccess:
				badge = chalk.bgYellow.bold( ' PASS ' );
				break;
			default:
				badge = chalk.bgGreen.bold( ' PASS ' );
				break;
		}

		logToConsole( ` >> ${ badge } Finished running ${ chalk.bold( test.name ) } suite` );
		logToConsole();
	} );

	harmonia.on( 'issue', issue => {
		let issueTypeString = issue.getTypeString();
		switch ( issue.type ) {
			case IssueType.Blocker:
				issueTypeString = chalk.bgRedBright.underline.bold( issueTypeString );
				break;
			case IssueType.Error:
				issueTypeString = chalk.bgRed.bold( issueTypeString );
				break;
			case IssueType.Warning:
				issueTypeString = chalk.bgYellow.bold( issueTypeString );
				break;
			case IssueType.Notice:
				issueTypeString = chalk.bgGray.bold( issueTypeString );
				break;
		}

		const documentation = issue.documentation ? `(${ issue.documentation })` : '';

		// Replace \n with \n\t\t to keep new lines aligned
		const message = issue.message.replace( /\n/g, '\n\t\t' );
		logToConsole( `    ${ issueTypeString } \t${ message } ${ documentation }` );

		// If it's a Blocker or Error, and the issue includes a stdout, print it out.
		const issueData = issue.getData();
		if ( issueData && [ IssueType.Blocker, IssueType.Error ].includes( issue.type ) ) {
			if ( issueData.all ) {
				logToConsole( issueData.all );
				logToConsole();
			} else if ( typeof issueData === 'string' ) {
				logToConsole( issueData );
				logToConsole();
			}
		}
	} );
}

function runHarmonia( harmonia ) {
	harmonia.run().then( async results => await handleResults( harmonia, results ) );
}

async function handleResults( harmonia, results ) {
	// Calculate the results
	const resultCounter = harmonia.countResults( false );
	const testSuiteResults = results.filter( result => result instanceof TestSuiteResult );

	// Send success event
	await trackEvent( 'validate_preflight_command_success', {
		command: 'vip validate preflight',
		...sanitizeArgsForTracking( harmoniaArgs ),
		skipped: resultCounter[ TestResultType.Skipped ],
		success: resultCounter[ TestResultType.Success ],
		partial_success: resultCounter[ TestResultType.PartialSuccess ],
		failed: resultCounter[ TestResultType.Failed ],
		aborted: resultCounter[ TestResultType.Aborted ],
	} );

	// If the output is JSON, reenable the logToConsole output and print-out the json format.
	if ( outputFormat === 'json' ) {
		suppressOutput = false;
		logToConsole( harmonia.resultsJSON() );
		process.exit( 0 );
	}

	// Print the results
	logToConsole( '\n' + chalk.bgGray( '        HARMONIA RESULTS        \n' ) );
	if ( resultCounter[ TestResultType.Skipped ] ) {
		logToConsole(
			` ${ chalk.bold.bgGrey( ' SKIPPED ' ) } - ${ chalk.bold(
				resultCounter[ TestResultType.Skipped ]
			) } tests`
		);
	}
	if ( resultCounter[ TestResultType.Success ] ) {
		logToConsole(
			` ${ chalk.bold.bgGreen( ' PASSED ' ) } - ${ chalk.bold(
				resultCounter[ TestResultType.Success ]
			) } tests`
		);
	}
	if ( resultCounter[ TestResultType.PartialSuccess ] ) {
		logToConsole(
			` ${ chalk.bold.bgYellow( ' PARTIAL SUCCESS ' ) } - ${ chalk.bold(
				resultCounter[ TestResultType.PartialSuccess ]
			) } tests`
		);
	}
	if ( resultCounter[ TestResultType.Failed ] ) {
		logToConsole(
			` ${ chalk.bold.bgRed( ' FAILED ' ) } - ${ chalk.bold(
				resultCounter[ TestResultType.Failed ]
			) } tests`
		);
	}
	if ( resultCounter[ TestResultType.Aborted ] ) {
		logToConsole(
			` ${ chalk.bold.bgRedBright( ' ABORTED ' ) } - ${ chalk.bold(
				resultCounter[ TestResultType.Aborted ]
			) } tests`
		);
	}

	logToConsole();
	logToConsole(
		` > Total of ${ chalk.bold(
			results.length - testSuiteResults.length
		) } tests have been executed.`
	);
	logToConsole();

	// If there is a Aborted test result
	if ( resultCounter[ TestResultType.Aborted ] ) {
		logToConsole(
			`${ chalk.bold.bgRedBright(
				'  NOT PASS  '
			) } There was a critical failure that makes the application ` +
				'incompatible with the VIP Platform. Please review the results and re-run the tests.'
		);
		process.exit( 1 );
	}

	// If there is only a partial success, but no failures
	if (
		resultCounter[ TestResultType.PartialSuccess ] &&
		! resultCounter[ TestResultType.Failed ]
	) {
		logToConsole(
			`${ chalk.bold.bgYellow(
				'  PASS  '
			) } The application has passed the required tests, but it does not follow all of the recommendations.`
		);
		logToConsole( 'Please review the results.' );
		process.exit( 0 );
	}

	// If there is a failure
	if ( resultCounter[ TestResultType.Failed ] ) {
		logToConsole(
			`${ chalk.bold.bgRed(
				'  NOT PASS  '
			) } The application has failed some tests, and will very likely have problems on a production ` +
				'environment. Please review all of the errors found in the results.'
		);
		process.exit( 1 );
	}

	logToConsole(
		`${ chalk.bold.bgGreen(
			'  PASS  '
		) } Congratulations! The application passes all of the tests.`
	);
	process.exit( 0 );
}

async function validateArgs( opt ) {
	const args = {};

	// Verbose
	if ( opt.verbose ) {
		Harmonia.setVerbosity( true );
	}

	// Set path
	if ( opt.path ) {
		Harmonia.setCwd( opt.path );
	}

	// If the JSON option is enabled, all the stdout should be suppressed to prevent polluting the output.
	if ( opt.format === 'json' ) {
		suppressOutput = true;
		outputFormat = 'json';
	}

	if ( opt.app ) {
		// Get build information from API and store it in the env object
		const buildConfig = await getBuildConfiguration( opt.app, opt.env );

		args.app_id = opt.app.id;
		args.env_id = opt.env.id;

		args.nodejsVersion = opt.nodeVersion ?? buildConfig.nodeJSVersion;
		args.buildType = buildConfig.buildType;
		args.npmToken = buildConfig.npmToken;
		args.nodeBuildDockerEnv = buildConfig.nodeBuildDockerEnv;
	} else {
		args.app_id = 0;
		args.env_id = 0;
		args.buildType = 'nodejs';

		// If no node.js version is specified, prompt the user to select one
		if ( ! opt.nodeVersion ) {
			// Ask for a node.js version
			try {
				const selection = await prompt( {
					type: 'select',
					name: 'nodejsVersion',
					message: 'Which Node.js version do you want to use?',
					choices: ALLOWED_NODEJS_VERSIONS,
				} );

				args.nodejsVersion = selection.nodejsVersion;
			} catch ( err ) {
				exit.withError( 'No Node.js version selected. Aborting.' );
			}
		} else {
			args.nodejsVersion = opt.nodeVersion;
		}
	}

	args.wait = opt.wait ?? 3000;
	args.port = opt.port ?? Math.floor( Math.random() * 1000 ) + 3001; // Get a PORT from 3001 and 3999

	return args;
}

/**
 * Remove sensitive information from the tracked events and snake_case the keys.
 *
 * @param {Object} args The arguments passed to the command.
 * @return {Object} Copy of the arguments without sensitive information.
 */
function sanitizeArgsForTracking( args ) {
	const protectedKeys = [ 'npmToken', 'nodeBuildDockerEnv' ];
	const sanitizedArgs = {};

	Object.entries( args ).forEach( ( [ key, value ] ) => {
		if ( protectedKeys.includes( key ) ) {
			return;
		}
		// snake_case the key, as required by Tracks
		sanitizedArgs[ key.replace( /[A-Z]/g, letter => `_${ letter.toLowerCase() }` ) ] = value;
	} );

	return sanitizedArgs;
}

let commandOpts = {
	module: 'harmonia',
};

// The @app.env selector is optional, so we need to check if it was passed
const parsedAlias = parseEnvAliasFromArgv( process.argv );

if ( parsedAlias.app ) {
	commandOpts = {
		...commandOpts,
		appQuery,
		envContext: true,
		appContext: true,
	};
} else {
	logToConsole(
		chalk.bold.yellow( 'Warning: ' ) +
			'The preflight tests are running without a provided application and/or environment.\n' +
			'Some app-dependent configurations, such as environment variables, might not be defined.'
	);
}

command( commandOpts )
	.option(
		'verbose',
		'Increase logging level to include app build and server boot up messages. Prints rows to the console as they are updated.',
		false
	)
	.option(
		'node-version',
		`The version of Node.JS to run the tests with. Accepts semver format (MAJOR.MINOR.PATCH) or a MAJOR (${ ALLOWED_NODEJS_VERSIONS.join(
			', '
		) }).`
	)
	.option(
		'wait',
		'Set the number of milliseconds to delay the start of a scan. Only necessary for apps that require a larger amount of time to start.',
		3000
	)
	.option(
		[ 'p', 'port' ],
		'Configure a port to use for the application (defaults to a random value between 3001 and 3999)'
	)
	.option(
		'format',
		'Render output in a particular format. Accepts “table” (default), “csv”, and “json”.'
	)
	.option( [ 'P', 'path' ], 'Path to the local application code.', process.cwd() )
	.examples( [
		{
			usage: 'vip validate preflight',
			description: 'Run the validate command from within the local Node.js codebase directory.',
		},
		{
			usage: 'vip @example-node-app.production validate preflight',
			description:
				'Run the validate command from within the local Node.js codebase directory.\n' +
				'       * Run the tests with settings that are identical to the targeted VIP Platform environment.',
		},
		{
			usage:
				'vip @example-node-app.production validate preflight --path=/Users/example/Desktop/example-node-repo',
			description:
				'Scan a local copy of the Node.js repository from a path on the user\'s local machine named "example-node-repo".',
		},
		{
			usage: 'vip @example-node-app.production validate preflight --format=json > results.json',
			description: 'Run the scan and output the results to a local file in JSON format.',
		},
		{
			usage: 'vip @example-node-app.production validate preflight --node-version=18',
			description: 'Run the scan and output the results to a local file in JSON format.',
		},
	] )
	.argv( process.argv, vipValidatePreflightCommand );
