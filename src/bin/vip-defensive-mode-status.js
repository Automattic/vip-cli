#!/usr/bin/env node

import chalk from 'chalk';

import { appQuery, getDefensiveMode } from '../lib/api/defensive-mode';
import command from '../lib/cli/command';
import * as exit from '../lib/cli/exit';
import { trackEvent } from '../lib/tracker';

const usage = 'vip defensive-mode status';
const exampleUsage = 'vip @example-app.develop defensive-mode status';

const examples = [
	{
		usage: exampleUsage,
		description: 'Display current Defensive Mode status and configuration.',
	},
	{
		usage: `${ exampleUsage } --format=json`,
		description: 'Display status in JSON format (for automation).',
	},
];

// eslint-disable-next-line complexity
export async function defensiveModeStatusCommand( arg, opt = {} ) {
	const trackingParams = {
		app_id: opt.app.id,
		command: 'vip defensive-mode status',
		env_id: opt.env.id,
	};

	await trackEvent( 'defensive_mode_status_command_execute', trackingParams );

	let result;
	try {
		result = await getDefensiveMode( opt.app.id, opt.env.id, opt.env );
	} catch ( err ) {
		await trackEvent( 'defensive_mode_status_command_error', {
			...trackingParams,
			error: err.message,
		} );

		exit.withError( `Failed to get Defensive Mode status: ${ err.message }` );
	}

	await trackEvent( 'defensive_mode_status_command_success', trackingParams );

	// JSON output format
	if ( opt.format === 'json' ) {
		console.log( JSON.stringify( result, null, 2 ) );
		return;
	}

	// Table output format (default)
	const config = result.data.effective;
	const stored = result.data.stored;

	const envName = opt.env.type || opt.env.name;
	console.log( chalk.bold( `Defensive Mode Status: ${ opt.app.name } (${ envName })` ) );
	console.log( '━'.repeat( 60 ) );
	console.log();

	// Status
	const statusColor = config.enabled ? chalk.green : chalk.gray;
	console.log( `Status:          ${ statusColor( config.enabled ? 'ACTIVE' : 'INACTIVE' ) }` );

	// Configuration details
	if ( config.enabled ) {
		console.log();
		console.log( chalk.bold( 'Configuration' ) );
		console.log( '━'.repeat( 60 ) );

		// Threshold (WordPress vs Node.js) - only show the one that's actually set
		if ( config.connectionThresholdPercentage !== undefined ) {
			const isCustom = stored?.connectionThresholdPercentage !== undefined;
			console.log(
				`Threshold:       ${ config.connectionThresholdPercentage }% PHP workers${
					isCustom ? '' : ' (default)'
				}`
			);
		} else if ( config.connectionThresholdAbsolute !== undefined ) {
			const isCustom = stored?.connectionThresholdAbsolute !== undefined;
			console.log(
				`Threshold:       ${ config.connectionThresholdAbsolute } concurrent requests${
					isCustom ? '' : ' (default)'
				}`
			);
		}

		// Challenge type
		const challengeTypes = {
			1: 'Proof of Work',
			2: 'Interactive Challenge',
		};
		const challengeLabel = challengeTypes[ config.challengeType ] || 'Unknown';
		const isCustomChallenge = stored?.challengeType !== undefined;
		console.log( `Challenge:       ${ challengeLabel }${ isCustomChallenge ? '' : ' (default)' }` );

		// Max request rate
		if ( config.maxRequestRate !== undefined ) {
			const rateLabel =
				config.maxRequestRate === 0 ? 'Unlimited' : `${ config.maxRequestRate } req/s per client`;
			const isCustomRate = stored?.maxRequestRate !== undefined;
			console.log( `Max Rate:        ${ rateLabel }${ isCustomRate ? '' : ' (default)' }` );
		}

		// Hysteresis
		if ( config.keepEnabledUnderThresholdForSeconds !== undefined ) {
			const isCustomHysteresis = stored?.keepEnabledUnderThresholdForSeconds !== undefined;
			console.log(
				`Hysteresis:      ${ config.keepEnabledUnderThresholdForSeconds }s${
					isCustomHysteresis ? '' : ' (default)'
				}`
			);
		}

		// Priority bypass
		if ( config.priorityBypass !== undefined ) {
			const isCustomPriority = stored?.priorityBypass !== undefined;
			console.log(
				`Priority Bypass: Level ${ config.priorityBypass }${ isCustomPriority ? '' : ' (default)' }`
			);
		}

		// Auto-disable
		if ( config.disableAtEpoch && config.disableAtEpoch > 0 ) {
			const disableDate = new Date( config.disableAtEpoch * 1000 );
			console.log( `Auto-disable:    ${ disableDate.toISOString() }` );
		}
	}

	console.log();
}

command( {
	appContext: true,
	appQuery,
	envContext: true,
	usage,
} )
	.option( 'format', 'Output format: table (default) or json' )
	.examples( examples )
	.argv( process.argv, defensiveModeStatusCommand );
