import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runtimePackagePaths } from '../../helpers/bun-runtime-packages';

describe( 'Bun runtime package selection', () => {
	let root;
	let installed;
	function add( name, metadata = {}, parent = root ) {
		const directory = path.join( parent, 'node_modules', name );
		fs.mkdirSync( directory, { recursive: true } );
		fs.writeFileSync(
			path.join( directory, 'package.json' ),
			JSON.stringify( { name, ...metadata } )
		);
		installed.push( directory );
		return directory;
	}
	beforeEach( () => {
		// Jest resolves module search paths through realpath, including Windows short paths.
		root = fs.realpathSync.native(
			fs.mkdtempSync( path.join( os.tmpdir(), 'vip-runtime-packages-' ) )
		);
		installed = [];
		add( '@github/keytar' );
		add( 'lando' );
		add( 'ssh2' );
	} );
	afterEach( () => fs.rmSync( root, { recursive: true, force: true } ) );

	it( 'includes transitive dependencies but excludes compiled-only packages and dev dependencies', () => {
		add( 'lando', {
			dependencies: { shared: '*', string_decoder: '*' },
			devDependencies: { testing: '*' },
		} );
		const shared = add( 'shared', { dependencies: { leaf: '*' } } );
		const leaf = add( 'leaf' );
		const unrelated = add( 'compiled-only' );
		const testing = add( 'testing' );
		const selected = runtimePackagePaths( root, installed );
		expect( selected ).toHaveLength( 5 );
		expect( selected ).toEqual( expect.arrayContaining( [ shared, leaf ] ) );
		expect( selected ).not.toContain( unrelated );
		expect( selected ).not.toContain( testing );
	} );

	it( 'resolves nested dependency versions from each requiring package and handles cycles', () => {
		const lando = add( 'lando', { dependencies: { shared: '*' } } );
		add( 'ssh2', { dependencies: { shared: '*' } } );
		const hoisted = add( 'shared' );
		const nested = add( 'shared', { dependencies: { lando: '*' } }, lando );
		expect( runtimePackagePaths( root, installed ) ).toEqual(
			expect.arrayContaining( [ nested, hoisted ] )
		);
	} );

	it( 'includes installed optional and peer dependencies and tolerates absent optional ones', () => {
		add( 'lando', {
			optionalDependencies: { available: '*', absent: '*' },
			peerDependencies: { peer: '*', optionalPeer: '*' },
			peerDependenciesMeta: { optionalPeer: { optional: true } },
		} );
		const available = add( 'available' );
		const peer = add( 'peer' );
		expect( runtimePackagePaths( root, installed ) ).toEqual(
			expect.arrayContaining( [ available, peer ] )
		);
	} );

	it( 'fails when a required transitive dependency is missing', () => {
		add( 'lando', { dependencies: { missing: '*' } } );
		expect( () => runtimePackagePaths( root, installed ) ).toThrow(
			/Missing runtime dependency missing/
		);
	} );

	it( 'fails when a required runtime root is absent from the production inventory', () => {
		installed = installed.filter( directory => ! directory.endsWith( `${ path.sep }ssh2` ) );
		expect( () => runtimePackagePaths( root, installed ) ).toThrow(
			/Missing runtime dependency ssh2/
		);
	} );
} );
