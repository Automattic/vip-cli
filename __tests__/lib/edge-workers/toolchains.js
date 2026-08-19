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

		it( 'scaffolds a project in an existing empty directory', () => {
			const project = path.join( tmp, 'empty-proj' );
			fs.mkdirSync( project );

			tc.scaffoldProject( project );

			expect( fs.existsSync( path.join( project, 'edge-workers.json' ) ) ).toBe( true );
		} );

		it( 'refuses a non-empty target before replacing files', () => {
			const project = path.join( tmp, 'existing-app' );
			fs.mkdirSync( project );
			fs.writeFileSync( path.join( project, 'package.json' ), '{"name":"customer-app"}\n' );

			expect( () => tc.scaffoldProject( project ) ).toThrow( /not empty/ );
			expect( fs.readFileSync( path.join( project, 'package.json' ), 'utf8' ) ).toBe(
				'{"name":"customer-app"}\n'
			);
			expect( fs.existsSync( path.join( project, 'edge-workers.json' ) ) ).toBe( false );
		} );

		it( 'refuses a file target', () => {
			const project = path.join( tmp, 'not-a-directory' );
			fs.writeFileSync( project, 'customer content\n' );

			expect( () => tc.scaffoldProject( project ) ).toThrow( /not a directory/ );
			expect( fs.readFileSync( project, 'utf8' ) ).toBe( 'customer content\n' );
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

		it( 'rejects a worker name that escapes the workers directory', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			expect( () => tc.scaffoldWorker( project, '../outside' ) ).toThrow( /Invalid worker name/ );
			expect( fs.existsSync( path.join( tmp, 'outside' ) ) ).toBe( false );
		} );

		it( 'rejects an entry that escapes the worker directory before compiling', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const worker = {
				dir: path.join( project, 'workers', 'demo' ),
				manifest: { name: 'demo', entry: '../outside.ts' },
			};
			expect( () => tc.compile( project, worker ) ).toThrow( /Worker entry must stay within/ );
		} );

		it( 'rejects a worker name that escapes the build directory', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			fs.mkdirSync( path.join( workerDir, 'assembly' ), { recursive: true } );
			fs.writeFileSync( path.join( workerDir, 'assembly', 'index.ts' ), 'export {};' );
			const worker = {
				dir: workerDir,
				manifest: { name: '../outside', entry: 'assembly/index.ts' },
			};
			expect( () => tc.compile( project, worker ) ).toThrow( /Invalid worker name/ );
			expect( fs.existsSync( path.join( tmp, 'outside.wasm' ) ) ).toBe( false );
		} );

		it( 'ensureAvailable throws when the compiler is missing', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			expect( () => tc.ensureAvailable( project ) ).toThrow( /npm install/ );
		} );
	} );
} );
