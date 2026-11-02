import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
	getEnvironmentPath,
	importMediaPath,
} from '../../../src/lib/dev-environment/dev-environment-core';

jest.mock( '../../../src/lib/tracker', () => ( { trackEvent: jest.fn() } ) );

describe( 'importMediaPath', () => {
	let root;
	let previousXdg;

	beforeEach( async () => {
		root = await mkdtemp( path.join( os.tmpdir(), 'vip-media-test-' ) );
		previousXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = root;
	} );

	afterEach( async () => {
		if ( previousXdg === undefined ) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = previousXdg;
		await rm( root, { recursive: true, force: true } );
	} );

	it( 'copies nested text and binary bytes without changing the source', async () => {
		const source = path.join( root, 'source' );
		const nested = path.join( source, 'nested' );
		const environment = getEnvironmentPath( 'test-site' );
		await mkdir( nested, { recursive: true } );
		await mkdir( environment, { recursive: true } );
		await writeFile( path.join( environment, 'instance_data.json' ), '{}' );
		const text = Buffer.from( 'media fixture\n' );
		const binary = Buffer.from( [ 0, 255, 19, 128, 4 ] );
		await writeFile( path.join( source, 'readme.txt' ), text );
		await writeFile( path.join( nested, 'image.bin' ), binary );

		await importMediaPath( 'test-site', source );

		const uploads = path.join( environment, 'uploads' );
		expect( ( await readdir( uploads ) ).sort() ).toEqual( [ 'nested', 'readme.txt' ] );
		expect( await readdir( path.join( uploads, 'nested' ) ) ).toEqual( [ 'image.bin' ] );
		expect( await readFile( path.join( uploads, 'readme.txt' ) ) ).toEqual( text );
		expect( await readFile( path.join( uploads, 'nested', 'image.bin' ) ) ).toEqual( binary );
		expect( await readFile( path.join( source, 'readme.txt' ) ) ).toEqual( text );
		expect( await readFile( path.join( nested, 'image.bin' ) ) ).toEqual( binary );
	} );
} );
