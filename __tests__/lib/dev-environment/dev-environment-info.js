import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { landoInfo } from '../../../src/lib/dev-environment/dev-environment-lando';

const nodeInfo = require( '../../../testdata/parity/devenv-info-node.cjs' );
const states = require( '../../../testdata/parity/devenv-info-services.json' );

test( 'info includes proxy URLs and assigned host ports without inventing unpublished endpoints', async () => {
	const directory = fs.mkdtempSync( path.join( tmpdir(), 'vip-info-' ) );
	const previous = process.env.XDG_DATA_HOME;
	process.env.XDG_DATA_HOME = directory;
	try {
		const instancePath = path.join( directory, 'vip/dev-environment/demo' );
		fs.mkdirSync( instancePath, { recursive: true } );
		fs.writeFileSync(
			path.join( instancePath, 'instance_data.json' ),
			JSON.stringify( { siteSlug: 'demo' } )
		);
		const info = await nodeInfo( landoInfo, instancePath, states, { http: '8000', https: '444' } );
		expect( info[ 'phpmyadmin urls' ] ).toEqual( [
			'http://localhost:49155',
			'http://demo-pma.vipdev.site:8000/',
			'https://demo-pma.vipdev.site:444/',
		] );
		expect( info[ 'mailpit urls' ] ).toEqual( [
			'http://demo-mailpit.vipdev.site:8000/',
			'https://demo-mailpit.vipdev.site:444/',
		] );
		expect( info.database ).toBe( '127.0.0.1:49153, [::]:49153' );
		expect( info[ 'enterprise search' ] ).toBe( 'http://127.0.0.1:49154, http://[::]:49154' );
		expect( info.photon ).toBeUndefined();
		expect( info[ 'photon urls' ] ).toBeUndefined();
	} finally {
		if ( previous === undefined ) {
			delete process.env.XDG_DATA_HOME;
		} else {
			process.env.XDG_DATA_HOME = previous;
		}
		fs.rmSync( directory, { recursive: true, force: true } );
	}
} );
