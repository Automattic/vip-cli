import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
	looksLikeIntegration,
	validateIntegration,
} from '../../src/lib/validate-integration/validate';

import type { CheckStatus } from '../../src/lib/validate-integration/validate';

/** Write a minimal but fully conformant integration into `root`. */
function scaffoldConformant( root: string ): void {
	mkdirSync( join( root, 'docs' ), { recursive: true } );
	mkdirSync( join( root, 'inc' ), { recursive: true } );
	mkdirSync( join( root, '.github', 'workflows' ), { recursive: true } );

	writeFileSync(
		join( root, 'composer.json' ),
		JSON.stringify( {
			name: 'acme/widget',
			type: 'wordpress-plugin',
			autoload: { classmap: [ 'inc/' ] },
			scripts: {
				test: [ '@test:unit', '@test:e2e' ],
				'test:unit': 'phpunit',
				'test:e2e': 'npm test',
				'validate-integration': '@php bin/validate-integration.php',
			},
		} )
	);

	writeFileSync(
		join( root, 'package.json' ),
		JSON.stringify( { name: 'e2e', scripts: { test: 'playwright test', build: 'echo none' } } )
	);

	writeFileSync(
		join( root, 'acme-widget.php' ),
		`<?php\n/**\n * Plugin Name: Acme Widget\n */\nrequire_once __DIR__ . '/vendor/autoload.php';\n`
	);

	writeFileSync(
		join( root, 'inc', 'class-config.php' ),
		`<?php\nfinal class Config {\n\tpublic const CONSTANT_NAME = 'VIP_ACME_WIDGET_CONFIG';\n\tpublic function __construct( $raw ) { if ( is_array( $raw ) ) {} }\n\tpublic function is_ready(): bool { return true; }\n\tpublic function missing_fields(): array { return []; }\n\tpublic function is_available(): bool { return defined( self::CONSTANT_NAME ); }\n}\n`
	);

	writeFileSync(
		join( root, 'inc', 'class-telemetry.php' ),
		`<?php\nfinal class Telemetry {\n\tprivate function __construct() {\n\t\tif ( class_exists( \\Automattic\\VIP\\Telemetry\\Telemetry::class ) ) {}\n\t}\n\tpublic function record_event( string $name, array $props = [] ): void {}\n}\n`
	);

	writeFileSync(
		join( root, 'docs', 'integration.md' ),
		[
			'# Integration',
			'',
			'## Build and test',
			'Run `composer install` and `npm ci`, then `composer test`. `npm run build` ships no assets.',
			'',
			'## Runtime config',
			'Config constant: `VIP_ACME_WIDGET_CONFIG`.',
			'',
			'Valid config:',
			'```php',
			"define( 'VIP_ACME_WIDGET_CONFIG', [ 'api_base_url' => 'x', 'api_token' => 'y' ] );",
			'```',
			'',
			'Incomplete config (a required value is missing):',
			'```php',
			"define( 'VIP_ACME_WIDGET_CONFIG', [ 'api_base_url' => 'x' ] );",
			'```',
		].join( '\n' )
	);

	writeFileSync(
		join( root, '.github', 'workflows', 'unit-tests.yml' ),
		[
			'jobs:',
			'  test:',
			'    strategy:',
			'      matrix:',
			'        config:',
			"          - { wp: 6.9.x, php: '8.2' }",
			"          - { wp: latest, php: '8.3' }",
			"          - { wp: latest, php: '8.4' }",
			"          - { wp: 7.0, php: '8.5' }",
		].join( '\n' )
	);
}

function statusById( root: string ): Record< string, CheckStatus > {
	const report = validateIntegration( root );
	return Object.fromEntries( report.results.map( result => [ result.id, result.status ] ) );
}

describe( 'validateIntegration', () => {
	let dir: string;

	beforeAll( () => {
		dir = mkdtempSync( join( tmpdir(), 'vip-validate-' ) );
	} );

	afterAll( () => {
		rmSync( dir, { recursive: true, force: true } );
	} );

	it( 'passes every rule for a conformant integration', () => {
		const root = join( dir, 'conformant' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );

		const report = validateIntegration( root );

		expect( report.conformant ).toBe( true );
		expect( report.results.every( result => result.status !== 'fail' ) ).toBe( true );
		expect( report.humanReview ).toHaveLength( 2 );
	} );

	it( 'fails and reports which rules broke for a non-conformant integration', () => {
		const root = join( dir, 'broken' );
		mkdirSync( root, { recursive: true } );
		writeFileSync(
			join( root, 'composer.json' ),
			JSON.stringify( { name: 'acme/broken', type: 'library' } )
		);

		const report = validateIntegration( root );
		const status = statusById( root );

		expect( report.conformant ).toBe( false );
		expect( status[ 'loads-through-starter-kit' ] ).toBe( 'fail' );
		expect( status[ 'composer-test' ] ).toBe( 'fail' );
		expect( status[ 'validate-integration-script' ] ).toBe( 'fail' );
		expect( status[ 'compatibility-matrix' ] ).toBe( 'fail' );
		// No config constant and no telemetry -> not applicable, not a failure.
		expect( status[ 'config-constant-documented' ] ).toBe( 'not_applicable' );
		expect( status[ 'telemetry-tracks-only' ] ).toBe( 'not_applicable' );
	} );

	it( 'fails rule 2 when composer test omits the e2e suite', () => {
		const root = join( dir, 'unit-only' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		writeFileSync(
			join( root, 'composer.json' ),
			JSON.stringify( {
				type: 'wordpress-plugin',
				autoload: { classmap: [ 'inc/' ] },
				scripts: { test: 'phpunit', 'validate-integration': 'echo ok' },
			} )
		);

		expect( statusById( root )[ 'composer-test' ] ).toBe( 'fail' );
	} );

	it( 'fails rule 1 when the composer type is not wordpress-plugin', () => {
		const root = join( dir, 'wrong-type' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		writeFileSync(
			join( root, 'composer.json' ),
			JSON.stringify( {
				type: 'library',
				autoload: { classmap: [ 'inc/' ] },
				scripts: { test: [ 'phpunit', 'playwright test' ], 'validate-integration': 'x' },
			} )
		);

		expect( statusById( root )[ 'loads-through-starter-kit' ] ).toBe( 'fail' );
	} );

	it( 'resolves npm-delegated e2e through package.json for rule 2', () => {
		const root = join( dir, 'npm-delegated' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		// composer test -> `npm test`, and package.json test -> `playwright test`.
		writeFileSync(
			join( root, 'composer.json' ),
			JSON.stringify( {
				type: 'wordpress-plugin',
				autoload: { classmap: [ 'inc/' ] },
				scripts: { test: [ 'phpunit', 'npm test' ], 'validate-integration': 'x' },
			} )
		);

		expect( statusById( root )[ 'composer-test' ] ).toBe( 'pass' );
	} );

	it( 'does not accept no-op echo commands as tests for rule 2', () => {
		const root = join( dir, 'echo-tests' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		writeFileSync(
			join( root, 'composer.json' ),
			JSON.stringify( {
				type: 'wordpress-plugin',
				autoload: { classmap: [ 'inc/' ] },
				scripts: { test: [ 'echo phpunit', 'echo npm test' ], 'validate-integration': 'x' },
			} )
		);

		expect( statusById( root )[ 'composer-test' ] ).toBe( 'fail' );
	} );

	it( 'fails rule 7 when compatibility is only prose, with no CI matrix', () => {
		const root = join( dir, 'no-ci' );
		mkdirSync( join( root, 'docs' ), { recursive: true } );
		scaffoldConformant( root );
		rmSync( join( root, '.github' ), { recursive: true, force: true } );
		writeFileSync(
			join( root, 'docs', 'compat.md' ),
			'Tested against WordPress 6.9 and 7.0, PHP 8.2, 8.3, 8.4, 8.5. Install the latest release.'
		);

		expect( statusById( root )[ 'compatibility-matrix' ] ).toBe( 'fail' );
	} );

	it( 'does not count `runs-on: ubuntu-latest` as WordPress 7.0 evidence', () => {
		const root = join( dir, 'ubuntu-latest' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		// A matrix that covers 6.9 and the PHP range but expresses no WP 7.0 or
		// `wp: latest` — only an unrelated `runs-on: ubuntu-latest` runner label.
		writeFileSync(
			join( root, '.github', 'workflows', 'unit-tests.yml' ),
			[
				'jobs:',
				'  test:',
				'    runs-on: ubuntu-latest',
				'    strategy:',
				'      matrix:',
				'        config:',
				"          - { wp: 6.9.x, php: '8.2' }",
				"          - { wp: 6.9.x, php: '8.3' }",
				"          - { wp: 6.9.x, php: '8.4' }",
				"          - { wp: 6.9.x, php: '8.5' }",
			].join( '\n' )
		);

		const rule7 = validateIntegration( root ).results.find(
			result => result.id === 'compatibility-matrix'
		);
		expect( rule7?.status ).toBe( 'fail' );
		expect( rule7?.message ).toMatch( /WordPress 7\.0/ );
	} );

	it( 'accepts `wp: latest` in the matrix as WordPress 7.0 evidence', () => {
		const root = join( dir, 'wp-latest' );
		mkdirSync( root, { recursive: true } );
		scaffoldConformant( root );
		writeFileSync(
			join( root, '.github', 'workflows', 'unit-tests.yml' ),
			[
				'jobs:',
				'  test:',
				'    runs-on: ubuntu-latest',
				'    strategy:',
				'      matrix:',
				'        config:',
				"          - { wp: 6.9.x, php: '8.2' }",
				"          - { wp: latest, php: '8.3' }",
				"          - { wp: latest, php: '8.4' }",
				"          - { wp: latest, php: '8.5' }",
			].join( '\n' )
		);

		expect( statusById( root )[ 'compatibility-matrix' ] ).toBe( 'pass' );
	} );

	it( 'distinguishes a malformed composer.json from a missing one', () => {
		const root = join( dir, 'malformed' );
		mkdirSync( root, { recursive: true } );
		writeFileSync( join( root, 'composer.json' ), '{ "type": "wordpress-plugin", ' );
		writeFileSync( join( root, 'plugin.php' ), '<?php\n/** Plugin Name: M */\n' );

		const rule1 = validateIntegration( root ).results.find(
			result => result.id === 'loads-through-starter-kit'
		);
		expect( rule1?.status ).toBe( 'fail' );
		expect( rule1?.message ).toMatch( /not valid JSON/ );
	} );

	it( 'warns on rule 5 when config access is not guarded', () => {
		const root = join( dir, 'unguarded' );
		mkdirSync( join( root, 'docs' ), { recursive: true } );
		writeFileSync(
			join( root, 'widget.php' ),
			`<?php\n/** Plugin Name: W */\n$c = constant( 'VIP_WIDGET_CONFIG' );\necho $c['api_token'];\n`
		);
		writeFileSync( join( root, 'composer.json' ), JSON.stringify( { type: 'wordpress-plugin' } ) );
		writeFileSync( join( root, 'docs', 'x.md' ), 'Config: `VIP_WIDGET_CONFIG`' );

		expect( statusById( root )[ 'graceful-config-handling' ] ).toBe( 'warn' );
	} );

	it( 'recognizes an integration directory', () => {
		const root = join( dir, 'conformant' );
		expect( looksLikeIntegration( root ) ).toBe( true );
		expect( looksLikeIntegration( join( dir, 'does-not-exist' ) ) ).toBe( false );
	} );
} );
