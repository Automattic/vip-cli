import { describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CliTest } from './helpers/cli-test';
import { createDockerClient, killProjectContainers } from './helpers/docker-utils';
import {
	createAndStartEnvironment,
	destroyEnvironment,
	getProjectSlug,
	prepareEnvironment,
} from './helpers/utils';

const podmanDescribe = process.env.VIP_DEV_ENV_TEST_ENGINE === 'podman' ? describe : describe.skip;

jest.setTimeout( 600 * 1000 ).retryTimes( 1, { logErrorsBeforeRetry: true } );

podmanDescribe( 'vip dev-env under podman', () => {
	let cliTest;
	let env;
	let tmpPath;
	let docker;
	let slug;

	beforeAll( async () => {
		cliTest = new CliTest();

		tmpPath = await mkdtemp( path.join( os.tmpdir(), 'vip-dev-env-' ) );
		process.env.XDG_DATA_HOME = tmpPath;

		env = prepareEnvironment( tmpPath );

		docker = await createDockerClient();
	} );

	afterAll( () => rm( tmpPath, { recursive: true, force: true } ) );

	afterEach( async () => {
		await destroyEnvironment( cliTest, slug, env );
		await killProjectContainers( docker, slug );
	} );

	it( 'serves WordPress content through the proxy', async () => {
		slug = getProjectSlug();
		await createAndStartEnvironment( cliTest, slug, env );

		const response = await fetch( `http://${ slug }.vipdev.lndo.site/` );
		const body = await response.text();

		expect( [ 200, 301, 302, 303, 307, 308 ] ).toContain( response.status );
		expect( body ).toContain( 'wp-content' );
	} );
} );
