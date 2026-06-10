import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProjectDescriptor, readWorkerManifest } from '../../../src/lib/edge-workers/project';
import { getToolchain } from '../../../src/lib/edge-workers/toolchains';

describe( 'edge-workers toolchains', () => {
	let tmp;

	beforeEach( () => {
		tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'ew-tc-' ) );
	} );

	afterEach( () => {
		fs.rmSync( tmp, { recursive: true, force: true } );
	} );

	it( 'throws for an unknown type', () => {
		expect( () => getToolchain( 'rust' ) ).toThrow( /Unknown edge worker type/ );
	} );

	describe( 'assemblyscript', () => {
		const tc = getToolchain( 'assemblyscript' );

		it( 'scaffolds a project with the expected layout', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );

			expect( readProjectDescriptor( project ).type ).toBe( 'assemblyscript' );
			expect( fs.existsSync( path.join( project, 'package.json' ) ) ).toBe( true );
			expect( fs.existsSync( path.join( project, 'tsconfig.json' ) ) ).toBe( true );
			expect( fs.existsSync( path.join( project, 'workers' ) ) ).toBe( true );

			const pkg = JSON.parse( fs.readFileSync( path.join( project, 'package.json' ), 'utf8' ) );
			expect( pkg.dependencies ).toHaveProperty( '@automattic/vip-edge-workers-sdk' );
			expect( pkg.devDependencies ).toHaveProperty( 'assemblyscript' );
		} );

		it( 'refuses to scaffold over an existing project', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			expect( () => tc.scaffoldProject( project ) ).toThrow( /already exists/ );
		} );

		it( 'scaffolds a worker with a manifest and entry file', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			tc.scaffoldWorker( project, 'my-worker' );

			const workerDir = path.join( project, 'workers', 'my-worker' );
			expect( readWorkerManifest( workerDir ) ).toEqual( {
				name: 'my-worker',
				entry: 'assembly/index.ts',
			} );
			expect( fs.existsSync( path.join( workerDir, 'assembly', 'index.ts' ) ) ).toBe( true );
		} );

		it( 'refuses to scaffold a worker that already exists', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			tc.scaffoldWorker( project, 'dup' );
			expect( () => tc.scaffoldWorker( project, 'dup' ) ).toThrow( /already exists/ );
		} );

		it( 'ensureAvailable throws when the compiler is missing', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			expect( () => tc.ensureAvailable( project ) ).toThrow( /npm install/ );
		} );
	} );
} );
