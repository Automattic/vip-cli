#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import debugLib from 'debug';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import { AppEnvironmentCustomDeployInput } from '../graphqlTypes';
import API from '../lib/api';
import command from '../lib/cli/command';
import { parseEnvAlias } from '../lib/cli/envAlias';
import * as exit from '../lib/cli/exit';
import { formatEnvironment, getGlyphForStatus } from '../lib/cli/format';
import { ProgressTracker } from '../lib/cli/progress';
import {
	getFileMeta,
	uploadImportFileToS3,
	WithId,
	UploadArguments,
} from '../lib/client-file-uploader';
import {
	checkCustomDeployKey,
	CustomDeployInfo,
	CustomDeployKeyCheck,
	validateFile,
	validateLargeArchiveFiles,
} from '../lib/custom-deploy/custom-deploy';
import { trackEventWithEnv } from '../lib/tracker';

const START_DEPLOY_MUTATION = gql`
	mutation StartCustomDeploy($input: AppEnvironmentCustomDeployInput) {
		startCustomDeploy(input: $input) {
			success
			message
		}
	}
`;

const debug = debugLib( '@automattic/vip:bin:vip-app-deploy' );
const baseUsage = 'vip app deploy';

const DEPLOY_PREFLIGHT_PROGRESS_STEPS = [
	{ id: 'upload', name: 'Uploading file' },
	{ id: 'deploy', name: 'Triggering deployment' },
];

interface PromptToContinueParams {
	launched: boolean;
	formattedEnvironment: string;
	track: ( eventName: string ) => Promise< unknown >;
	domain: string;
}

/**
 * Prompt the user to confirm the environment they are deploying to.
 * @param {PromptToContinueParams} PromptToContinueParams
 */
export async function promptToContinue( params: PromptToContinueParams ) {
	const promptToMatch = params.domain.toUpperCase();
	const promptResponse = await prompt( {
		type: 'input',
		name: 'confirmedDomain',
		message: `You are about to deploy to a ${ params.launched ? 'launched' : 'un-launched' } ${
			params.formattedEnvironment
		} site ${ chalk.yellow( params.domain ) }.\nType '${ chalk.yellow(
			promptToMatch
		) }' (without the quotes) to continue:\n`,
	} );

	if ( ( promptResponse.confirmedDomain as string ).toUpperCase() !== promptToMatch ) {
		await params.track( 'deploy_app_unexpected_input' );
		exit.withError( 'The input did not match the expected environment label. Deploy aborted.' );
	}
}

export interface DeployTarget {
	app: string | number;
	env: string | number;
}

const TARGET_FORMAT_ERROR =
	'Invalid --to value. Targets are in the format of app-name.environment-name (e.g. example-app.production).';
const TARGET_CONFLICT_ERROR =
	'The --to option cannot be used with --app, --env, or an @app.env alias.';

/**
 * Resolve the list of environments to deploy to.
 *
 * Without --to, the single app/env from --app/--env (or an @app.env alias) is used.
 * --to can be repeated and/or comma-separated: --to=app-a.production,app-b.develop
 */
export function parseDeployTargets( opts: Record< string, unknown > ): DeployTarget[] {
	if ( opts.to === undefined ) {
		return [ { app: opts.app as string | number, env: opts.env as string | number } ];
	}

	if ( opts.app !== undefined || opts.env !== undefined ) {
		exit.withError( TARGET_CONFLICT_ERROR );
	}

	const rawValues = Array.isArray( opts.to ) ? opts.to : [ opts.to ];
	const targets: DeployTarget[] = [];
	const seen = new Set< string >();

	for ( const rawValue of rawValues ) {
		if ( typeof rawValue !== 'string' ) {
			exit.withError( TARGET_FORMAT_ERROR );
		}

		for ( const part of rawValue.split( ',' ) ) {
			// Same grammar as the @app.env alias, minus the "@".
			let app: string;
			let env: string | undefined;
			try {
				( { app, env } = parseEnvAlias( `@${ part.trim() }` ) );
			} catch {
				exit.withError( TARGET_FORMAT_ERROR );
			}
			if ( ! app || ! env ) {
				exit.withError( TARGET_FORMAT_ERROR );
			}

			const label = `${ app }.${ env }`;
			if ( seen.has( label ) ) {
				continue;
			}
			seen.add( label );
			targets.push( { app, env } );
		}
	}

	return targets;
}

type DeployKeyCheckResult = CustomDeployKeyCheck & { label: string };

/**
 * List which environments the deploy key was validated for and which it was not.
 * Mirrored by formatDeployKeySummary in cmd/vip-next/commands/app_deploy.go.
 */
export function formatDeployKeySummary( checks: DeployKeyCheckResult[] ): string {
	const failed = checks.filter( check => 'error' in check ).length;
	const lines = checks.map( check =>
		'error' in check ? `  ✕ ${ check.label }: ${ check.error }` : `  ✓ ${ check.label }`
	);

	return `The deploy key could not be validated for ${ failed } of ${
		checks.length
	} environments:\n${ lines.join( '\n' ) }`;
}

/**
 * Check the deploy key against every target before touching any of them, and
 * exit with a per-environment summary if any is rejected. The same environment
 * can be addressed by name and by ID; it is returned only once.
 */
async function validateDeployTargets( targets: DeployTarget[] ): Promise< CustomDeployInfo[] > {
	debug( 'Validating custom deploy key...' );
	const checks: DeployKeyCheckResult[] = [];
	for ( const { app, env } of targets ) {
		// eslint-disable-next-line no-await-in-loop
		const check = await checkCustomDeployKey( app, env );
		debug( 'Deploy key check: ', check );
		checks.push( { label: `${ app }.${ env }`, ...check } );
	}

	const [ firstFailure ] = checks.filter( check => 'error' in check );
	if ( firstFailure && 'error' in firstFailure ) {
		exit.withError( targets.length === 1 ? firstFailure.error : formatDeployKeySummary( checks ) );
	}

	const validatedTargets: CustomDeployInfo[] = [];
	const seenEnvIds = new Set< number >();
	for ( const check of checks ) {
		if ( 'info' in check && ! seenEnvIds.has( check.info.envId ) ) {
			seenEnvIds.add( check.info.envId );
			validatedTargets.push( check.info );
		}
	}

	return validatedTargets;
}

// `environmentIds` was added to Parker's AppEnvironmentCustomDeployInput (vip-go-api#8478).
// Drop this once src/graphqlTypes.d.ts is regenerated from a schema that includes it.
type CustomDeployInput = AppEnvironmentCustomDeployInput & {
	environmentIds?: number[];
};

export async function appDeployCmd( arg: string[] = [], opts: Record< string, unknown > = {} ) {
	const targets = parseDeployTargets( opts );

	const [ fileName ] = arg;
	const fileMeta = await getFileMeta( fileName );

	debug( 'Options: ', opts );
	debug( 'Args: ', arg );

	const validatedTargets = await validateDeployTargets( targets );

	const isMultiTarget = validatedTargets.length > 1;
	// The archive is uploaded once, to the first target; the API builds every target from it.
	const [ primaryTarget ] = validatedTargets;
	const { appId, envId } = primaryTarget;

	const track = trackEventWithEnv.bind( null, appId, envId );

	debug( 'Validating file...' );
	await validateFile( appId, envId, fileMeta );

	if ( ! opts.skipLargeFileValidation ) {
		await validateLargeArchiveFiles( appId, envId, fileMeta );
	}

	for ( const target of validatedTargets ) {
		// eslint-disable-next-line no-await-in-loop
		await trackEventWithEnv( target.appId, target.envId, 'deploy_app_command_execute' );
	}

	// Upload file as different name to avoid overwriting existing same named files
	const datePrefix = new Date()
		.toISOString()
		// eslint-disable-next-line no-useless-escape
		.replace( /[\-T:\.Z]/g, '' )
		.slice( 0, 14 );
	fileMeta.basename = `${ datePrefix }-${ fileMeta.basename }`;

	const deployMessage = ( opts.message as string ) ?? '';
	const skipConfirm = opts.force || opts.skipConfirmation;

	// Confirm every target up front so nothing is deployed unless all are confirmed.
	if ( ! skipConfirm ) {
		for ( const target of validatedTargets ) {
			// eslint-disable-next-line no-await-in-loop
			await promptToContinue( {
				launched: Boolean( target.launched ),
				formattedEnvironment: formatEnvironment( target.envType ),
				track: trackEventWithEnv.bind( null, target.appId, target.envId ),
				domain: target.primaryDomainName,
			} );
		}
	}

	/**
	 * =========== WARNING =============
	 *
	 * NO `console.log` after this point!
	 * Yes, even inside called functions.
	 * It will break the progress printing.
	 *
	 * =========== WARNING =============
	 */
	const progressTracker = new ProgressTracker( DEPLOY_PREFLIGHT_PROGRESS_STEPS );

	let status = 'running';

	const destination = isMultiTarget
		? `${ validatedTargets.length } environments`
		: 'your environment';

	const setProgressTrackerPrefixAndSuffix = () => {
		progressTracker.prefix = `
=============================================================
Processing the file for deployment to ${ destination }...
`;
		progressTracker.suffix = `\n${ getGlyphForStatus(
			status,
			progressTracker.runningSprite
		) } Running...`;
	};

	const failWithError = ( failureError: Error | string ) => {
		status = 'failed';
		setProgressTrackerPrefixAndSuffix();
		progressTracker.stopPrinting();
		progressTracker.print( { clearAfter: true } );

		exit.withError( failureError );
	};

	progressTracker.startPrinting( setProgressTrackerPrefixAndSuffix );

	progressTracker.stepRunning( 'upload' );

	// Call the Public API
	const api = API();

	const progressCallback = ( percentage: string ) => {
		progressTracker.setUploadPercentage( percentage );
	};

	const appInput = { id: appId } as WithId;
	const envInput = { id: envId } as WithId;
	const uploadParams: UploadArguments = {
		app: appInput,
		env: envInput,
		fileMeta,
		progressCallback,
		hashType: 'sha256',
	};
	let startDeployVariables: { input: CustomDeployInput } | undefined;

	try {
		const {
			fileMeta: { basename },
			checksum,
			result,
		} = await uploadImportFileToS3( uploadParams );

		startDeployVariables = {
			input: {
				id: appId,
				basename: fileMeta.basename,
				checksum,
				deployMessage,
				// Single-target deploys keep the original `environmentId` contract.
				...( isMultiTarget
					? { environmentIds: validatedTargets.map( target => target.envId ) }
					: { environmentId: envId } ),
			},
		};

		debug( { basename, checksum, result, startDeployVariables } );
		debug( 'Upload complete. Initiating the deploy.' );
		progressTracker.stepSuccess( 'upload' );
		await track( 'deploy_app_upload_complete' );
	} catch ( uploadError ) {
		await track( 'deploy_app_command_error', {
			error_type: 'upload_failed',
			upload_error: ( uploadError as Error ).message,
		} );

		progressTracker.stepFailed( 'upload' );
		return failWithError( uploadError as Error );
	}

	progressTracker.stepRunning( 'deploy' );

	// Start the deploy
	try {
		const WPVIP_DEPLOY_TOKEN = process.env.WPVIP_DEPLOY_TOKEN;
		const startDeployResults = await api.mutate( {
			mutation: START_DEPLOY_MUTATION,
			variables: startDeployVariables,
			context: {
				headers: {
					Authorization: `Bearer ${ WPVIP_DEPLOY_TOKEN }`,
				},
			},
		} );

		debug( { startDeployResults } );
	} catch ( gqlErr ) {
		await track( 'deploy_app_command_error', {
			error_type: 'StartDeploy-failed',
			gql_err: gqlErr as Error,
		} );

		progressTracker.stepFailed( 'deploy' );
		return failWithError( `StartDeploy call failed: ${ ( gqlErr as Error ).message }` );
	}

	progressTracker.stepSuccess( 'deploy' );
	progressTracker.stopPrinting();

	progressTracker.suffix = '';
	progressTracker.print( { clearAfter: true } );

	const deploymentsUrl = ( target: CustomDeployInfo ) =>
		`https://dashboard.wpvip.com/apps/${ target.appId }/${ target.envUniqueLabel }/code/deployments`;
	const formatDomain = ( target: CustomDeployInfo ) =>
		chalk.bold( chalk.blue( target.primaryDomainName ) );

	const sentTo = isMultiTarget ? destination : formatDomain( primaryTarget );
	const links = isMultiTarget
		? `:\n${ validatedTargets
				.map( target => `  - ${ formatDomain( target ) }: ${ deploymentsUrl( target ) }` )
				.join( '\n' ) }`
		: `: ${ deploymentsUrl( primaryTarget ) }`;
	console.log(
		`\n✅ ${ chalk.bold(
			chalk.underline( chalk.magenta( fileMeta.basename ) )
		) } has been sent for deployment to ${ sentTo }. \nTo check deployment status, go to ${ chalk.bold(
			'VIP Dashboard'
		) }${ links }`
	);
}

// Command examples for the `vip deploy app` help prompt
const examples = [
	// `app` subcommand
	{
		usage: 'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.zip',
		description:
			'Deploy a local archived file named "file.zip" that contains application code to a VIP Platform environment that has Custom Deployment enabled.',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.tgz --message="A description for this deploy"',
		description:
			'Add a descriptive message for the Custom Deployment of the archived file named "file.tgz".',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.tar.gz --skip-confirmation',
		description:
			'Skip the confirmation prompt for the Custom Deployment of the archived file named "file.tar.gz" to the environment.',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip @example-app.develop app deploy file.zip --skip-large-file-validation',
		description: 'Skip checking the deploy archive for repository archive files larger than 20 MB.',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip app deploy file.tar.gz --to=example-app.production --to=other-app.develop',
		description:
			'Deploy the same archived file to multiple environments. The deploy token must grant access to every environment.',
	},
	{
		usage:
			'WPVIP_DEPLOY_TOKEN=1234 vip app deploy file.tar.gz --to=example-app.production,other-app.develop',
		description: 'Deploy to multiple environments listed as a comma-separated value.',
	},
];

void command( {
	requiredArgs: 1,
	usage: baseUsage,
} )
	.command( 'validate', 'Validate the directory structure of an archived file.' )
	.examples( examples )
	.option( 'message', 'Add a description of a deployment.' )
	.option( 'skip-confirmation', 'Skip the confirmation prompt.' )
	.option(
		'skip-large-file-validation',
		'Skip checking for repository archive files over 20 MB.',
		false
	)
	.option( 'force', 'Skip confirmation prompt (deprecated)' )
	.option(
		'app',
		'Target an application. Accepts a string value for the application name or an integer for the application ID.'
	)
	.option( 'env', 'Target an environment. Accepts a string value for the environment type.' )
	.option(
		'to',
		'Deploy to an environment in the format app-name.environment-name. Repeat the option or separate values with commas to deploy to multiple environments.'
	)
	.argv( process.argv, appDeployCmd );
