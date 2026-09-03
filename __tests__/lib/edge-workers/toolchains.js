import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readProjectDescriptor, readWorkerManifest } from '../../../src/lib/edge-workers/project';
import { getToolchain } from '../../../src/lib/edge-workers/toolchains';

jest.mock( 'node:child_process', () => ( {
	spawnSync: jest.fn(),
} ) );

describe( 'edge-workers toolchains', () => {
	let tmp;

	beforeEach( () => {
		tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'ew-tc-' ) );
		spawnSync.mockClear();
		spawnSync.mockImplementation( ( _command, args ) => {
			const outFile = args[ args.indexOf( '--outFile' ) + 1 ];
			fs.writeFileSync( outFile, 'compiled wasm' );
			return { status: 0, stderr: '', stdout: '' };
		} );
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
			expect( pkg.dependencies[ '@automattic/vip-edge-workers-sdk' ] ).toBe( '0.4.0' );
			expect( pkg.devDependencies.assemblyscript ).toBe( '0.27.0' );

			const readme = fs.readFileSync( path.join( project, 'README.md' ), 'utf8' );
			expect( readme ).toContain( 'Commit the generated `package-lock.json`' );
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

		it( 'refuses a symlinked directory target', () => {
			const realDir = path.join( tmp, 'real-dir' );
			fs.mkdirSync( realDir );
			const project = path.join( tmp, 'linked-app' );
			fs.symlinkSync( realDir, project, 'dir' );

			expect( () => tc.scaffoldProject( project ) ).toThrow( /not a directory/ );
			expect( fs.existsSync( path.join( realDir, 'edge-workers.json' ) ) ).toBe( false );
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

			const source = fs.readFileSync( path.join( workerDir, 'assembly', 'index.ts' ), 'utf8' );
			expect( source ).toContain( 'on_client_response' );
			expect( source ).not.toMatch( /^\s*on_client_request,?$/m );
			expect( source ).not.toMatch( /^\s*on_origin_request,?$/m );
			expect( source ).not.toMatch( /^\s*on_origin_response,?$/m );
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

		it( 'rejects an entry symlink that escapes the worker directory before compiling', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			const entryDir = path.join( workerDir, 'assembly' );
			const outside = path.join( tmp, 'secret.ts' );
			fs.mkdirSync( entryDir, { recursive: true } );
			fs.writeFileSync( outside, 'TOP_SECRET_SOURCE' );
			fs.symlinkSync( outside, path.join( entryDir, 'index.ts' ), 'file' );
			const worker = {
				dir: workerDir,
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			};

			expect( () => tc.compile( project, worker ) ).toThrow( /Worker entry must stay within/ );
			expect( spawnSync ).not.toHaveBeenCalled();
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

		it( 'rejects a symlinked build root before the compiler can write outside the project', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			const entry = path.join( workerDir, 'assembly', 'index.ts' );
			const outsideBuild = path.join( tmp, 'outside-build' );
			fs.mkdirSync( path.dirname( entry ), { recursive: true } );
			fs.writeFileSync( entry, 'export {};' );
			fs.mkdirSync( outsideBuild );
			fs.symlinkSync(
				outsideBuild,
				path.join( project, 'build' ),
				process.platform === 'win32' ? 'junction' : 'dir'
			);

			expect( () =>
				tc.compile( project, {
					dir: workerDir,
					manifest: { name: 'demo', entry: 'assembly/index.ts' },
				} )
			).toThrow( /Worker build directory must not be a symbolic link/ );
			expect( spawnSync ).not.toHaveBeenCalled();
			expect( fs.existsSync( path.join( outsideBuild, 'demo.wasm' ) ) ).toBe( false );
		} );

		it( 'rejects a symlinked build output before the compiler can overwrite its target', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			const entry = path.join( workerDir, 'assembly', 'index.ts' );
			const buildDir = path.join( project, 'build' );
			const outside = path.join( tmp, 'outside.wasm' );
			fs.mkdirSync( path.dirname( entry ), { recursive: true } );
			fs.writeFileSync( entry, 'export {};' );
			fs.mkdirSync( buildDir );
			fs.writeFileSync( outside, 'DO NOT OVERWRITE' );
			fs.symlinkSync( outside, path.join( buildDir, 'demo.wasm' ), 'file' );

			expect( () =>
				tc.compile( project, {
					dir: workerDir,
					manifest: { name: 'demo', entry: 'assembly/index.ts' },
				} )
			).toThrow( /Worker build artifact must not be a symbolic link/ );
			expect( spawnSync ).not.toHaveBeenCalled();
			expect( fs.readFileSync( outside, 'utf8' ) ).toBe( 'DO NOT OVERWRITE' );
		} );

		it( 'rejects a dangling build-output symlink before the compiler can create its target', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			const entry = path.join( workerDir, 'assembly', 'index.ts' );
			const buildDir = path.join( project, 'build' );
			const outside = path.join( tmp, 'not-yet-created.wasm' );
			fs.mkdirSync( path.dirname( entry ), { recursive: true } );
			fs.writeFileSync( entry, 'export {};' );
			fs.mkdirSync( buildDir );
			fs.symlinkSync( outside, path.join( buildDir, 'demo.wasm' ), 'file' );

			expect( () =>
				tc.compile( project, {
					dir: workerDir,
					manifest: { name: 'demo', entry: 'assembly/index.ts' },
				} )
			).toThrow( /Worker build artifact must not be a symbolic link/ );
			expect( spawnSync ).not.toHaveBeenCalled();
			expect( fs.existsSync( outside ) ).toBe( false );
		} );

		it( 'creates a real build directory inside the canonical project root', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			const workerDir = path.join( project, 'workers', 'demo' );
			const entry = path.join( workerDir, 'assembly', 'index.ts' );
			fs.mkdirSync( path.dirname( entry ), { recursive: true } );
			fs.writeFileSync( entry, 'export {};' );

			const output = tc.compile( project, {
				dir: workerDir,
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			} );

			expect( fs.lstatSync( path.join( project, 'build' ) ).isDirectory() ).toBe( true );
			expect( fs.lstatSync( path.join( project, 'build' ) ).isSymbolicLink() ).toBe( false );
			expect( fs.realpathSync.native( output ) ).toBe(
				path.join( fs.realpathSync.native( project ), 'build', 'demo.wasm' )
			);
		} );

		it( 'ensureAvailable throws when the compiler is missing', () => {
			const project = path.join( tmp, 'proj' );
			tc.scaffoldProject( project );
			expect( () => tc.ensureAvailable( project ) ).toThrow( /npm install/ );
		} );
	} );
} );
