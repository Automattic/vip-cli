/**
 * Rendering for the integration conformance report — a human-readable summary
 * for developers and a machine-readable JSON payload for CI.
 */

import chalk from 'chalk';

import type { CheckResult, CheckStatus, ValidationReport } from './validate';

const STATUS_LABEL: Record< CheckStatus, string > = {
	pass: 'PASS',
	fail: 'FAIL',
	warn: 'WARN',
	not_applicable: 'N/A ',
};

function colorForStatus( status: CheckStatus, text: string ): string {
	switch ( status ) {
		case 'pass':
			return chalk.green( text );
		case 'fail':
			return chalk.red( text );
		case 'warn':
			return chalk.yellow( text );
		default:
			return chalk.gray( text );
	}
}

function formatCheck( result: CheckResult ): string {
	const label = colorForStatus( result.status, STATUS_LABEL[ result.status ] );
	const details = ( result.details ?? [] ).map( detail => chalk.gray( `        - ${ detail }` ) );
	return [
		`  ${ label }  Rule ${ result.rule }: ${ result.title }`,
		`        ${ result.message }`,
		...details,
	].join( '\n' );
}

export function formatHumanReport( report: ValidationReport ): string {
	const counts = report.results.reduce< Record< CheckStatus, number > >(
		( acc, result ) => {
			acc[ result.status ] += 1;
			return acc;
		},
		{ pass: 0, fail: 0, warn: 0, not_applicable: 0 }
	);

	const humanReviewLines = report.humanReview.flatMap( item => [
		`  ${ chalk.cyan( '•' ) } ${ item.title }`,
		chalk.gray( `    ${ item.reason }` ),
	] );

	const verdict = report.conformant
		? chalk.green.bold( '✓ Conformant — no automated checks failed.' )
		: chalk.red.bold( '✗ Not conformant — one or more automated checks failed.' );

	return [
		'',
		chalk.bold( `Integration conformance check: ${ report.path }` ),
		'',
		...report.results.map( formatCheck ),
		'',
		chalk.bold( 'Human review required (not automated):' ),
		...humanReviewLines,
		'',
		`Summary: ${ counts.pass } passed, ${ counts.fail } failed, ${ counts.warn } warnings, ${ counts.not_applicable } n/a.`,
		verdict,
		'',
	].join( '\n' );
}

export function formatJsonReport( report: ValidationReport ): string {
	return JSON.stringify( report, null, 2 );
}
