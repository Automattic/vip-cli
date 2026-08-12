import { describe, expect, it, jest } from '@jest/globals';
import Docker from 'dockerode';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliTest } from './helpers/cli-test';
import {
	vipDevEnvCreate,
	vipDevEnvExec,
	vipDevEnvStart,
	vipDevEnvUpdate,
} from './helpers/commands';
import { killProjectContainers } from './helpers/docker-utils';
import {
	checkEnvExists,
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';
import { DEV_ENVIRONMENT_VERSION } from '../../src/lib/constants/dev-environment';

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
const OLD_MARIADB_COMMAND =
	'docker-entrypoint.sh mysqld --sql-mode=ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION --max_allowed_packet=67M';

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
	/** @type {string|undefined} */
	let mariaDbSlug;

	/**
	 * @param {string} query       SQL query
	 * @param {string} projectSlug Environment slug
	 */
	const dbQuery = async ( query, projectSlug = slug ) => {
		const result = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				projectSlug,
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
		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		process.env.XDG_DATA_HOME = tmpPath;

		env = prepareEnvironment( tmpPath );
		docker = new Docker();

		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );
	} );

	/**
	 * @param {string|undefined} projectSlug Environment slug
	 */
	const destroyProject = async projectSlug => {
		if ( ! projectSlug ) {
			return;
		}

		try {
			if ( await checkEnvExists( projectSlug ) ) {
				await destroyEnvironment( cliTest, projectSlug, env );
			}
		} finally {
			await killProjectContainers( docker, projectSlug );
		}
	};

	afterAll( async () => {
		try {
			await destroyProject( slug );
		} finally {
			await destroyProject( mariaDbSlug );
		}
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );

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
			[ process.argv[ 0 ], vipDevEnvStart, '--slug', slug, '--skip-rebuild', '-w' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `Current local environment version is: ${ OLD_VERSION }` );
		expect( result.stdout ).toContain(
			`Local environment version updated to: ${ DEV_ENVIRONMENT_VERSION }`
		);
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		const updatedInstanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		expect( updatedInstanceData.version ).toBe( DEV_ENVIRONMENT_VERSION );

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

	it( 'should upgrade an existing MariaDB 10.3 environment without losing data', async () => {
		mariaDbSlug = getProjectSlug();
		const instancePath = path.join( tmpPath, 'vip', 'dev-environment', mariaDbSlug );
		const instanceDataPath = path.join( instancePath, 'instance_data.json' );
		const landoFilePath = path.join( instancePath, '.lando.yml' );

		let result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvCreate, '--slug', mariaDbSlug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );

		const instanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		instanceData.mariadb = '10.3';
		await writeFile( instanceDataPath, JSON.stringify( instanceData, null, 2 ) );

		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvUpdate, '--slug', mariaDbSlug ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );

		const landoFile = await readFile( landoFilePath, 'utf8' );
		const oldLandoFile = landoFile.replace(
			/command: docker-entrypoint\.sh mysqld[^\n]*/,
			`command: ${ OLD_MARIADB_COMMAND }`
		);
		expect( oldLandoFile ).not.toBe( landoFile );
		await writeFile( landoFilePath, oldLandoFile );

		// Initialize the data directory with the old MariaDB command before
		// exercising the version-triggered rebuild.
		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStart, '--slug', mariaDbSlug, '-w' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		const marker = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				mariaDbSlug,
				'--quiet',
				'--',
				'wp',
				'option',
				'add',
				'mariadb_upgrade_e2e_marker',
				'survived',
			],
			{ env },
			true
		);
		expect( marker.rc ).toBe( 0 );

		const oldInstanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		oldInstanceData.version = OLD_VERSION;
		await writeFile( instanceDataPath, JSON.stringify( oldInstanceData, null, 2 ) );

		result = await cliTest.spawn(
			[ process.argv[ 0 ], vipDevEnvStart, '--slug', mariaDbSlug, '--skip-rebuild', '-w' ],
			{ env },
			true
		);
		expect( result.rc ).toBe( 0 );
		expect( result.stdout ).toContain( `Current local environment version is: ${ OLD_VERSION }` );
		expect( result.stdout ).toContain(
			`Local environment version updated to: ${ DEV_ENVIRONMENT_VERSION }`
		);
		expect( result.stdout ).toMatch( /STATUS\s+UP/u );

		const updatedInstanceData = JSON.parse( await readFile( instanceDataPath, 'utf8' ) );
		expect( updatedInstanceData.version ).toBe( DEV_ENVIRONMENT_VERSION );
		expect( updatedInstanceData.mariadb ).toBe( '10.3' );

		const row = await dbQuery(
			'SELECT @@log_bin, @@innodb_buffer_pool_size, @@innodb_log_file_size, @@innodb_log_files_in_group, @@innodb_flush_log_at_trx_commit',
			mariaDbSlug
		);
		const [ logBin, bufferPoolSize, logFileSize, logFileCount, flushMode ] = row
			.split( /\s+/ )
			.map( Number );
		expect( logBin ).toBe( 0 );
		expect( bufferPoolSize ).toBeGreaterThan( STOCK_BUFFER_POOL_SIZE );
		expect( logFileSize * logFileCount ).toBeGreaterThan( STOCK_REDO_LOG_CAPACITY );
		expect( flushMode ).not.toBe( 1 );

		const markerValue = await cliTest.spawn(
			[
				process.argv[ 0 ],
				vipDevEnvExec,
				'--slug',
				mariaDbSlug,
				'--quiet',
				'--',
				'wp',
				'option',
				'get',
				'mariadb_upgrade_e2e_marker',
			],
			{ env },
			true
		);
		expect( markerValue.rc ).toBe( 0 );
		expect( markerValue.stdout.trim() ).toBe( 'survived' );
	} );
} );
