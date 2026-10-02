import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
	createEnvironment,
	getEnvironmentPath,
} from '../../../src/lib/dev-environment/dev-environment-core';

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

	it.each( [
		[ 'disabled', false, '', '' ],
		[ 'bare-domain', false, 'example.test', 'https://example.test/$1' ],
		[ 'https', false, 'https://example.test', 'https://example.test/$1' ],
		[ 'http-path', false, 'http://example.test/media', 'http://example.test/media/$1' ],
		[ 'photon', true, '', '' ],
		[ 'photon-and-redirect', true, 'https://example.test', 'https://example.test/$1' ],
		[ 'trailing-slash', true, 'example.test/media/', 'https://example.test/media//$1' ],
	] )( 'materializes %s routing', async ( name, photon, mediaRedirectDomain, target ) => {
		await createEnvironment(
			{ config: { domain: 'vipdev.site' } },
			{
				siteSlug: 'nginx-unit',
				wpTitle: 'Nginx test',
				multisite: false,
				wordpress: { mode: 'image', tag: '7.1' },
				muPlugins: { mode: 'image' },
				appCode: { mode: 'image' },
				mediaRedirectDomain,
				photon,
			}
		);
		const conf = fs.readFileSync(
			path.join( getEnvironmentPath( 'nginx-unit' ), 'nginx', 'extra.conf' ),
			'utf8'
		);
		expect( conf ).toContain( target );
		expect( conf.includes( 'photon:9000' ) ).toBe( photon );
		expect( conf.includes( 'rewrite' ) ).toBe( Boolean( mediaRedirectDomain ) );
		expect( conf.includes( 'location' ) ).toBe( name !== 'disabled' );
	} );
} );
