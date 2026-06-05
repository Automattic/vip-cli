import { describe, expect, it, jest } from '@jest/globals';
import Docker from 'dockerode';
import nock from 'nock';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliTest } from './helpers/cli-test';
import { vipDevEnvExec, vipDevEnvStart } from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';
import {
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

// Stock server defaults that the template deliberately overrides. Values below are
// asserted as "not stock" floors rather than exact matches, so future tuning of the
// template (e.g. shrinking the buffer pool) does not break this test; only *losing*
// an override (falling back to the stock default) fails it.
const STOCK_BUFFER_POOL_SIZE = 134217728; // 128M
const STOCK_REDO_LOG_CAPACITY = 104857600; // ~100M

const OLD_VERSION = '2.3.3';
const OLD_DB_COMMAND =
	'docker-entrypoint.sh mysqld --sql-mode=ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION --max_allowed_packet=67M --mysql-native-password=ON';

describe( 'dev-env database performance defaults', () => {
	/** @type {CliTest} */
	let cliTest;
	/** @type {NodeJS.ProcessEnv} */
	let env;
	/** @type {string} */
	let tmpPath;
	/** @type {Docker} */
	let docker;
	/** @type {string} */
	let slug;

	const dbQuery = async query => {
		const result = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				slug,
				'--quiet',
				'--',
				'wp',
				'db',
				'query',
				query,
				'--skip-column-names',
			],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		return result.stdout.trim();
	};

	const assertTunedDatabaseDefaults = async () => {
		const row = await dbQuery(
			'SELECT @@log_bin, @@innodb_buffer_pool_size, @@innodb_redo_log_capacity, @@innodb_flush_log_at_trx_commit'
		);
		const [ logBin, bufferPoolSize, redoLogCapacity, flushMode ] = row.split( /\s+/ ).map( Number );

		// Binary logging must be off: nothing consumes binlogs locally and they
		// double the write volume of large imports.
		expect( logBin ).toBe( 0 );
		// Must be configured above the stock defaults; exact values are a tuning choice.
		expect( bufferPoolSize ).toBeGreaterThan( STOCK_BUFFER_POOL_SIZE );
		expect( redoLogCapacity ).toBeGreaterThan( STOCK_REDO_LOG_CAPACITY );
		// Anything but fsync-per-commit (1) preserves the bulk-write intent.
		expect( flushMode ).not.toBe( 1 );
	};

	beforeAll( async () => {
		nock.cleanAll();
		nock.enableNetConnect();

		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		process.env.XDG_DATA_HOME = tmpPath;

		env = prepareEnvironment( tmpPath );
		docker = new Docker();

		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );
	} );

	afterAll( async () => {
		try {
			await destroyEnvironment( cliTest, slug, env );
		} finally {
			await killProjectContainers( docker, slug );
		}
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );
	afterAll( () => nock.restore() );

	// eslint-disable-next-line jest/expect-expect -- assertions live in assertTunedDatabaseDefaults
	it( 'should run the database with tuned (non-stock) defaults', async () => {
		await assertTunedDatabaseDefaults();
	} );

	it( 'should apply the tuned defaults to an environment created by an older CLI', async () => {
		// Simulate an environment created before the defaults changed: stamp the
		// pre-tuning version and restore the old database command line.
		const instanceDataPath = path.join(
			tmpPath,
			'vip',
			'dev-environment',
			slug,
			'instance_data.json'
		);
		const instanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		expect( instanceData.version ).not.toBe( OLD_VERSION );
		instanceData.version = OLD_VERSION;
		await writeFile( instanceDataPath, JSON.stringify( instanceData, null, 2 ) );

		const landoFilePath = path.join( tmpPath, 'vip', 'dev-environment', slug, '.lando.yml' );
		const landoFile = await readFile( landoFilePath, 'utf8' );
		const oldLandoFile = landoFile.replace(
			/command: docker-entrypoint\.sh mysqld[^\n]*/,
			`command: ${ OLD_DB_COMMAND }`
		);
		expect( oldLandoFile ).not.toBe( landoFile );
		await writeFile( landoFilePath, oldLandoFile );

		// Plant data that must survive the upgrade rebuild.
		const marker = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				slug,
				'--quiet',
				'--',
				'wp',
				'option',
				'add',
				'upgrade_e2e_marker',
				'survived',
			],
			{ env },
			true
		);
		expect( marker.rc ).toBe( 0 );

		// Starting with the current CLI must detect the old version, re-render the
		// template, and rebuild the environment without prompting.
		const result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStart, '--slug', slug, '-w' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `Current local environment version is: ${ OLD_VERSION }` );
		expect( result.stdout ).toContain( 'Local environment version updated to:' );
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		const updatedInstanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		expect( updatedInstanceData.version ).not.toBe( OLD_VERSION );

		// The tuned defaults apply to the pre-existing data directory...
		await assertTunedDatabaseDefaults();

		// ...and the data survived the transition.
		const markerValue = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				slug,
				'--quiet',
				'--',
				'wp',
				'option',
				'get',
				'upgrade_e2e_marker',
			],
			{ env },
			true
		);
		expect( markerValue.rc ).toBe( 0 );
		expect( markerValue.stdout.trim() ).toBe( 'survived' );
	} );
} );
