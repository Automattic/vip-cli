import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	createEnvironment,
	getEnvironmentPath,
} from '../../../src/lib/dev-environment/dev-environment-core';
import fixture from '../../../testdata/parity/devenv-nginx.json';

describe( 'dev-env nginx media routing', () => {
	let directory;
	let previousDataHome;

	beforeEach( () => {
		previousDataHome = process.env.XDG_DATA_HOME;
		directory = fs.mkdtempSync( path.join( tmpdir(), 'vip-nginx-unit-' ) );
		process.env.XDG_DATA_HOME = directory;
	} );

	afterEach( () => {
		if ( previousDataHome === undefined ) {
			delete process.env.XDG_DATA_HOME;
		} else {
			process.env.XDG_DATA_HOME = previousDataHome;
		}
		fs.rmSync( directory, { recursive: true, force: true } );
	} );

	it.each( fixture.modes )( 'materializes $name routing', async mode => {
		await createEnvironment(
			{ config: { domain: 'vipdev.site' } },
			{
				siteSlug: 'nginx-unit',
				wpTitle: 'Nginx test',
				multisite: false,
				wordpress: { mode: 'image', tag: '7.1' },
				muPlugins: { mode: 'image' },
				appCode: { mode: 'image' },
				mediaRedirectDomain: mode.mediaRedirectDomain,
				photon: mode.photon,
			}
		);
		const conf = fs.readFileSync(
			path.join( getEnvironmentPath( 'nginx-unit' ), 'nginx', 'extra.conf' ),
			'utf8'
		);
		for ( const directive of mode.contains ) {
			expect( conf ).toContain( directive );
		}
		expect( conf.includes( 'photon:9000' ) ).toBe( mode.photon );
		expect( conf.includes( 'rewrite' ) ).toBe( Boolean( mode.mediaRedirectDomain ) );
		expect( conf.includes( 'location' ) ).toBe( mode.name !== 'disabled' );
	} );
} );
