#!/usr/bin/env node

import chalk from 'chalk';
import { prompt } from 'enquirer';

import command from '../lib/cli/command';
import { formatEnvironment } from '../lib/cli/format';
import { appQuery, updateDefensiveModeConfig } from '../lib/defensive-mode/api';
import { confirm } from '../lib/envvar/input';
import { trackEvent } from '../lib/tracker';

const baseUsage = 'vip defensive-mode configure';
const exampleUsage = 'vip @example-app.production defensive-mode configure';

const examples = [
	{
		usage: `${ exampleUsage } --enabled=true --challenge-type=1`,
		description: 'Update defensive mode configuration non-interactively (minimal required flags).',
	},
	{
		usage: `${ exampleUsage } --enabled=true --challenge-type=2 --connection-threshold-absolute=5000 --connection-threshold-percentage=80`,
		description: 'Update with explicit thresholds.',
	},
];

function isInteractive( opt ) {
	if ( process.env.VIP_NON_INTERACTIVE === '1' ) {
		return false;
	}
	if ( opt.nonInteractive ) {
		return false;
	}
	return Boolean( process.stdout.isTTY );
}

function parseBoolean( raw ) {
	if ( raw === true || raw === false ) {
		return raw;
	}
	if ( typeof raw !== 'string' ) {
		return null;
	}
	const normalized = raw.trim().toLowerCase();
	if ( [ 'true', 'yes', '1', 'on', 'enable', 'enabled' ].includes( normalized ) ) {
		return true;
	}
	if ( [ 'false', 'no', '0', 'off', 'disable', 'disabled' ].includes( normalized ) ) {
		return false;
	}
	return null;
}

function parsePositiveInt( raw ) {
	if ( raw === undefined || raw === null || raw === '' ) {
		return null;
	}
	const num = Number( raw );
	if ( ! Number.isInteger( num ) || num < 0 ) {
		return null;
	}
	return num;
}

function validateFlags( opt ) {
	const errors = [];

	const enabled = opt.enabled === undefined ? null : parseBoolean( opt.enabled );
	if ( opt.enabled !== undefined && enabled === null ) {
		errors.push( `Invalid value for --enabled: ${ opt.enabled }. Expected true or false.` );
	}

	const challengeType =
		opt.challengeType === undefined ? null : parsePositiveInt( opt.challengeType );
	if ( opt.challengeType !== undefined && challengeType === null ) {
		errors.push(
			`Invalid value for --challenge-type: ${ opt.challengeType }. Expected a non-negative integer.`
		);
	}

	const absolute =
		opt.connectionThresholdAbsolute === undefined
			? undefined
			: parsePositiveInt( opt.connectionThresholdAbsolute );
	if ( opt.connectionThresholdAbsolute !== undefined && absolute === null ) {
		errors.push(
			`Invalid value for --connection-threshold-absolute: ${ opt.connectionThresholdAbsolute }. Expected a non-negative integer.`
		);
	}

	const percentage =
		opt.connectionThresholdPercentage === undefined
			? undefined
			: parsePositiveInt( opt.connectionThresholdPercentage );
	if ( opt.connectionThresholdPercentage !== undefined && percentage === null ) {
		errors.push(
			`Invalid value for --connection-threshold-percentage: ${ opt.connectionThresholdPercentage }. Expected a non-negative integer.`
		);
	}

	return { enabled, challengeType, absolute, percentage, errors };
}

async function resolveRequiredViaPrompt( missing, enabled, challengeType ) {
	const answers = await prompt(
		missing.map( flag =>
			flag === '--enabled'
				? {
						type: 'confirm',
						name: 'enabled',
						message: 'Enable defensive mode?',
				  }
				: {
						type: 'input',
						name: 'challengeType',
						message: 'Challenge type (integer):',
				  }
		)
	);

	let resolvedEnabled = enabled;
	let resolvedChallengeType = challengeType;

	if ( resolvedEnabled === null && 'enabled' in answers ) {
		resolvedEnabled = Boolean( answers.enabled );
	}
	if ( resolvedChallengeType === null && 'challengeType' in answers ) {
		resolvedChallengeType = parsePositiveInt( answers.challengeType );
		if ( resolvedChallengeType === null ) {
			console.error( chalk.red( 'Challenge type must be a non-negative integer.' ) );
			process.exit( 1 );
		}
	}

	return { enabled: resolvedEnabled, challengeType: resolvedChallengeType };
}

export async function defensiveModeConfigureCommand( _args, opt ) {
	const interactive = isInteractive( opt );
	const trackingParams = {
		app_id: opt.app.id,
		command: baseUsage,
		env_id: opt.env.id,
		org_id: opt.app.organization.id,
		org_sfid: opt.app.organization.salesforceId,
		interactive,
		skip_confirm: Boolean( opt.skipConfirmation ),
	};

	await trackEvent( 'defensive_mode_configure_command_execute', trackingParams );

	const {
		enabled: rawEnabled,
		challengeType: rawChallengeType,
		absolute,
		percentage,
		errors,
	} = validateFlags( opt );

	if ( errors.length > 0 ) {
		errors.forEach( msg => console.error( chalk.red( msg ) ) );
		process.exit( 1 );
	}

	const missing = [];
	if ( rawEnabled === null ) {
		missing.push( '--enabled' );
	}
	if ( rawChallengeType === null ) {
		missing.push( '--challenge-type' );
	}

	let enabled = rawEnabled;
	let challengeType = rawChallengeType;

	if ( missing.length > 0 ) {
		if ( ! interactive ) {
			console.error(
				chalk.red( `Missing required flags in non-interactive mode: ${ missing.join( ', ' ) }` )
			);
			console.error(
				'Re-run with all required flags, or remove --non-interactive and run on a TTY.'
			);
			await trackEvent( 'defensive_mode_configure_command_error', {
				...trackingParams,
				error: 'missing-required-flags',
			} );
			process.exit( 1 );
		}

		( { enabled, challengeType } = await resolveRequiredViaPrompt(
			missing,
			enabled,
			challengeType
		) );
	}

	const input = {
		appId: opt.app.id,
		envId: opt.env.id,
		enabled,
		challengeType,
	};
	if ( absolute !== undefined ) {
		input.connectionThresholdAbsolute = absolute;
	}
	if ( percentage !== undefined ) {
		input.connectionThresholdPercentage = percentage;
	}

	const currentConfig = opt.env.defensiveMode?.config?.effective ?? null;
	if ( currentConfig ) {
		console.log( chalk.bold( 'Current defensive-mode configuration:' ) );
		console.log( JSON.stringify( currentConfig, null, 2 ) );
	}
	console.log( chalk.bold( 'Proposed defensive-mode configuration:' ) );
	console.log( JSON.stringify( input, null, 2 ) );

	if ( interactive && ! opt.skipConfirmation && opt.env.type === 'production' ) {
		const yes = await confirm(
			`Apply this configuration to ${ formatEnvironment( opt.env.type ) } for ${
				opt.app.name
			}?\n${ JSON.stringify( input, null, 2 ) }`
		);
		if ( ! yes ) {
			await trackEvent( 'defensive_mode_configure_command_cancelled', trackingParams );
			console.log( 'Command cancelled' );
			process.exit();
		}
	}

	const result = await updateDefensiveModeConfig( input );

	if ( ! result.success ) {
		await trackEvent( 'defensive_mode_configure_command_error', {
			...trackingParams,
			error: result.message,
		} );
		console.error( chalk.red( `Failed to update defensive mode config: ${ result.message }` ) );
		process.exit( 1 );
	}

	await trackEvent( 'defensive_mode_configure_command_success', trackingParams );
	console.log(
		chalk.green( '✓' ),
		`Defensive mode configuration updated for ${ opt.app.name }.${ opt.env.type } — ${ result.message }`
	);
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage: baseUsage,
} )
	.option( 'enabled', 'Whether defensive mode should be enabled (true|false). Required.' )
	.option( 'challenge-type', 'Challenge type integer. Required.' )
	.option(
		'connection-threshold-absolute',
		'Absolute connection threshold that triggers defensive mode.'
	)
	.option(
		'connection-threshold-percentage',
		'Connection threshold percentage that triggers defensive mode.'
	)
	.option(
		'non-interactive',
		'Disable prompts and browser-open; fail fast if a required flag is missing.',
		false
	)
	.option( 'skip-confirmation', 'Skip the confirmation prompt for production envs.', false )
	.examples( examples )
	.argv( process.argv, defensiveModeConfigureCommand );
