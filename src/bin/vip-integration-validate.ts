#!/usr/bin/env node

/**
 * External dependencies
 */
import chalk from 'chalk';
import { resolve } from 'node:path';

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';
import { trackEvent } from '../lib/tracker';
import { formatHumanReport, formatJsonReport } from '../lib/validate-integration/report';
import { looksLikeIntegration, validateIntegration } from '../lib/validate-integration/validate';

const usage = 'vip integration validate';

const examples = [
	{
		usage: 'vip integration validate',
		description: 'Check the integration in the current directory for conformance.',
	},
	{
		usage: 'vip integration validate ./my-integration',
		description: 'Check the integration in the given directory.',
	},
	{
		usage: 'vip integration validate --format json',
		description: 'Emit a machine-readable JSON report (for CI).',
	},
];

export async function integrationValidateCommand(
	arg: string[] = [],
	opts: Record< string, unknown > = {}
): Promise< void > {
	const root = resolve( arg[ 0 ] ?? process.cwd() );

	const format = typeof opts.format === 'string' ? opts.format : 'human';
	if ( format !== 'human' && format !== 'json' ) {
		console.error( chalk.red( `Unknown --format "${ format }". Use "human" or "json".` ) );
		process.exitCode = 1;
		return;
	}
	const asJson = format === 'json';

	await trackEvent( 'integration_validate_command_execute' );

	if ( ! looksLikeIntegration( root ) ) {
		const message = `No integration found at ${ root } (expected a composer.json or a plugin entry file).`;
		if ( asJson ) {
			console.log( JSON.stringify( { path: root, error: message }, null, 2 ) );
		} else {
			console.error( chalk.red( message ) );
		}
		await trackEvent( 'integration_validate_command_error', { reason: 'not_an_integration' } );
		process.exitCode = 1;
		return;
	}

	const report = validateIntegration( root );

	console.log( asJson ? formatJsonReport( report ) : formatHumanReport( report ) );

	await trackEvent( 'integration_validate_command_success', {
		conformant: report.conformant,
		failed: report.results.filter( result => result.status === 'fail' ).length,
	} );

	if ( ! report.conformant ) {
		process.exitCode = 1;
	}
}

void command( {
	requiredArgs: 0,
	usage,
} )
	.option( 'format', 'Output format: "human" (default) or "json".', 'human' )
	.examples( examples )
	.argv( process.argv, integrationValidateCommand );
