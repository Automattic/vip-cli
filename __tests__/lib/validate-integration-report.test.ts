import { describe, expect, it } from '@jest/globals';

import { formatHumanReport, formatJsonReport } from '../../src/lib/validate-integration/report';

import type { ValidationReport } from '../../src/lib/validate-integration/validate';

function sampleReport( conformant: boolean ): ValidationReport {
	return {
		path: '/tmp/acme',
		results: [
			{ id: 'a', rule: 1, title: 'First rule', status: 'pass', message: 'looks good' },
			{
				id: 'b',
				rule: 2,
				title: 'Second rule',
				status: conformant ? 'warn' : 'fail',
				message: conformant ? 'heads up' : 'broken',
				details: [ 'evidence line' ],
			},
			{ id: 'c', rule: 3, title: 'Third rule', status: 'not_applicable', message: 'skipped' },
		],
		humanReview: [ { title: 'Security review', reason: 'human only' } ],
		conformant,
	};
}

describe( 'validate-integration report', () => {
	it( 'renders a human report with per-rule verdicts and the human-review section', () => {
		const text = formatHumanReport( sampleReport( true ) );
		expect( text ).toContain( 'Rule 1: First rule' );
		expect( text ).toContain( 'evidence line' );
		expect( text ).toContain( 'Human review required' );
		expect( text ).toContain( 'Security review' );
		expect( text ).toContain( 'Conformant' );
		expect( text ).toContain( '1 passed' );
	} );

	it( 'marks a non-conformant report clearly', () => {
		const text = formatHumanReport( sampleReport( false ) );
		expect( text ).toContain( 'Not conformant' );
		expect( text ).toContain( '1 failed' );
	} );

	it( 'emits valid, round-trippable JSON', () => {
		const report = sampleReport( false );
		const parsed = JSON.parse( formatJsonReport( report ) ) as ValidationReport;
		expect( parsed.conformant ).toBe( false );
		expect( parsed.results ).toHaveLength( 3 );
		expect( parsed.humanReview[ 0 ].title ).toBe( 'Security review' );
	} );
} );
