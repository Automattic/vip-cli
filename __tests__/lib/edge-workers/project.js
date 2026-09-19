import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readPrebuiltWorker, readWorkerSource } from '../../../src/lib/edge-workers';
import {
	CONVENTIONAL_PROJECT_DIR,
	discoverWorkers,
	findWorker,
	readProjectDescriptor,
	readWorkerManifest,
	resolveProjectDir,
	writeProjectDescriptor,
	writeWorkerManifest,
} from '../../../src/lib/edge-workers/project';

function makeProject( root ) {
	fs.mkdirSync( root, { recursive: true } );
	writeProjectDescriptor( root, { type: 'assemblyscript' } );
	return root;
}

function makeWorker( root, name, manifest = {} ) {
	const dir = path.join( root, 'workers', name );
	fs.mkdirSync( dir, { recursive: true } );
	writeWorkerManifest( dir, { name, entry: 'assembly/index.ts', ...manifest } );
	return dir;
}

describe( 'edge-workers project', () => {
	let tmp;

	beforeEach( () => {
		tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'ew-test-' ) );
	} );

	afterEach( () => {
		fs.rmSync( tmp, { recursive: true, force: true } );
	} );

	describe( 'resolveProjectDir', () => {
		it( 'resolves an explicit --path containing a descriptor', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			expect( resolveProjectDir( { path: 'proj' }, tmp ) ).toBe( project );
		} );

		it( 'throws when --path has no descriptor', () => {
			fs.mkdirSync( path.join( tmp, 'empty' ) );
			expect( () => resolveProjectDir( { path: 'empty' }, tmp ) ).toThrow(
				/No edge-workers project/
			);
		} );

		it( 'walks up from the cwd to find the descriptor', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			const deep = path.join( project, 'workers', 'a', 'assembly' );
			fs.mkdirSync( deep, { recursive: true } );
			expect( resolveProjectDir( {}, deep ) ).toBe( project );
		} );

		it( 'falls back to the conventional subfolder', () => {
			const project = makeProject( path.join( tmp, CONVENTIONAL_PROJECT_DIR ) );
			expect( resolveProjectDir( {}, tmp ) ).toBe( project );
		} );

		it( 'throws with guidance when nothing is found', () => {
			expect( () => resolveProjectDir( {}, tmp ) ).toThrow( /vip edge-workers init/ );
		} );

		it( 'rejects a --path flag passed without a value', () => {
			// A value-less `--path` arrives as boolean true from the arg parser.
			expect( () => resolveProjectDir( { path: true }, tmp ) ).toThrow(
				/--path flag requires a path/
			);
		} );
	} );

	describe( 'descriptor', () => {
		it( 'round-trips the descriptor', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			expect( readProjectDescriptor( project ) ).toEqual( { type: 'assemblyscript' } );
		} );

		it( 'throws when the descriptor lacks a type', () => {
			const project = path.join( tmp, 'proj' );
			fs.mkdirSync( project, { recursive: true } );
			fs.writeFileSync( path.join( project, 'edge-workers.json' ), '{}' );
			expect( () => readProjectDescriptor( project ) ).toThrow( /missing a "type"/ );
		} );

		it( 'rejects an unsupported descriptor type', () => {
			const project = path.join( tmp, 'proj' );
			fs.mkdirSync( project, { recursive: true } );
			fs.writeFileSync( path.join( project, 'edge-workers.json' ), '{"type":"rust"}' );
			expect( () => readProjectDescriptor( project ) ).toThrow( /invalid "type"/ );
		} );

		it( 'rejects a null descriptor', () => {
			const project = path.join( tmp, 'proj' );
			fs.mkdirSync( project, { recursive: true } );
			fs.writeFileSync( path.join( project, 'edge-workers.json' ), 'null' );
			expect( () => readProjectDescriptor( project ) ).toThrow( /invalid "type"/ );
		} );

		it( 'rejects a symlinked descriptor', () => {
			const project = path.join( tmp, 'proj' );
			fs.mkdirSync( project, { recursive: true } );
			const outside = path.join( tmp, 'outside.json' );
			fs.writeFileSync( outside, '{"type":"assemblyscript"}' );
			fs.symlinkSync( outside, path.join( project, 'edge-workers.json' ), 'file' );
			expect( () => readProjectDescriptor( project ) ).toThrow(
				/project descriptor at .* must not be a symbolic link/
			);
		} );
	} );

	describe( 'worker manifests', () => {
		it( 'rejects a null manifest', () => {
			const worker = path.join( tmp, 'worker' );
			fs.mkdirSync( worker, { recursive: true } );
			fs.writeFileSync( path.join( worker, 'worker.json' ), 'null' );
			expect( () => readWorkerManifest( worker ) ).toThrow( /must be an object/ );
		} );

		it( 'rejects an entry outside the worker directory', () => {
			const worker = path.join( tmp, 'worker' );
			fs.mkdirSync( worker, { recursive: true } );
			fs.writeFileSync(
				path.join( worker, 'worker.json' ),
				'{"name":"demo","entry":"../outside.ts"}'
			);
			expect( () => readWorkerManifest( worker ) ).toThrow( /Worker entry must stay within/ );
		} );

		it( 'rejects a symlinked manifest', () => {
			const worker = path.join( tmp, 'worker' );
			fs.mkdirSync( worker, { recursive: true } );
			const outside = path.join( tmp, 'outside-manifest.json' );
			fs.writeFileSync( outside, '{"name":"demo","entry":"assembly/index.ts"}' );
			fs.symlinkSync( outside, path.join( worker, 'worker.json' ), 'file' );
			expect( () => readWorkerManifest( worker ) ).toThrow(
				/worker manifest at .* must not be a symbolic link/
			);
		} );
	} );

	describe( 'discoverWorkers / findWorker', () => {
		it( 'discovers workers sorted by name and ignores dirs without a manifest', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'beta' );
			makeWorker( project, 'alpha' );
			fs.mkdirSync( path.join( project, 'workers', 'no-manifest' ), { recursive: true } );

			const names = discoverWorkers( project ).map( worker => worker.manifest.name );
			expect( names ).toEqual( [ 'alpha', 'beta' ] );
		} );

		it( 'returns an empty list when there is no workers dir', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			expect( discoverWorkers( project ) ).toEqual( [] );
		} );

		it( 'rejects case-insensitive duplicate manifest names', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'first', { name: 'Headers' } );
			makeWorker( project, 'second', { name: 'headers' } );
			expect( () => discoverWorkers( project ) ).toThrow( /Duplicate worker name/ );
		} );

		it( 'finds a worker by name', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'alpha' );
			expect( findWorker( project, 'alpha' ).manifest.name ).toBe( 'alpha' );
		} );

		it( 'prefers an exact manifest name over a directory-name fallback', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'target', { name: 'directory-fallback' } );
			makeWorker( project, 'other-directory', { name: 'target' } );

			expect( findWorker( project, 'target' ).manifest.name ).toBe( 'target' );
		} );

		it( 'throws listing available workers when not found', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'alpha' );
			expect( () => findWorker( project, 'nope' ) ).toThrow( /Available workers: alpha/ );
		} );
	} );

	describe( 'worker source and artifacts', () => {
		it.each( [
			[ [ 0xff, 0xff ], '\ufffd\ufffd' ],
			[ [ 0xe1, 0x80 ], '\ufffd' ],
			[ [ 0xe1, 0x80, 0xff ], '\ufffd\ufffd' ],
		] )( 'replaces malformed UTF-8 source sequences %j', ( bytes, expected ) => {
			const worker = {
				dir: tmp,
				manifest: { name: 'headers', entry: 'source.ts' },
			};
			fs.writeFileSync( path.join( tmp, 'source.ts' ), Buffer.from( bytes ) );
			expect( readWorkerSource( worker ) ).toBe( expected );
		} );

		it( 'throws when worker source cannot be read', () => {
			const worker = {
				dir: path.join( tmp, 'worker' ),
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			};
			expect( () => readWorkerSource( worker ) ).toThrow( /Could not read worker source/ );
		} );

		it( 'rejects an entry symlink that escapes the worker directory', () => {
			const workerDir = path.join( tmp, 'worker' );
			const entryDir = path.join( workerDir, 'assembly' );
			const outside = path.join( tmp, 'secret.ts' );
			fs.mkdirSync( entryDir, { recursive: true } );
			fs.writeFileSync( outside, 'TOP_SECRET_SOURCE' );
			fs.symlinkSync( outside, path.join( entryDir, 'index.ts' ), 'file' );

			const worker = {
				dir: workerDir,
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			};

			expect( () => readWorkerSource( worker ) ).toThrow( /Worker entry must stay within/ );
		} );

		it( 'rejects traversal in prebuilt artifact names', () => {
			const worker = {
				dir: path.join( tmp, 'worker' ),
				manifest: { name: '../outside', entry: 'assembly/index.ts' },
			};
			expect( () => readPrebuiltWorker( path.join( tmp, 'project' ), worker ) ).toThrow(
				/Invalid worker name/
			);
		} );

		it( 'rejects a prebuilt artifact symlink that escapes the project', () => {
			const project = makeProject( path.join( tmp, 'project' ) );
			const buildDir = path.join( project, 'build' );
			const outside = path.join( tmp, 'secret.wasm' );
			fs.mkdirSync( buildDir );
			fs.writeFileSync( outside, 'TOP_SECRET_WASM' );
			fs.symlinkSync( outside, path.join( buildDir, 'demo.wasm' ), 'file' );

			const worker = {
				dir: path.join( project, 'workers', 'demo' ),
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			};

			expect( () => readPrebuiltWorker( project, worker ) ).toThrow(
				/Worker build artifact must not be a symbolic link/
			);
		} );

		it( 'rejects a prebuilt artifact symlink that escapes the build directory', () => {
			const project = makeProject( path.join( tmp, 'project' ) );
			const buildDir = path.join( project, 'build' );
			const outsideBuild = path.join( project, 'project-secret.wasm' );
			fs.mkdirSync( buildDir );
			fs.writeFileSync( outsideBuild, 'PROJECT_SECRET_WASM' );
			fs.symlinkSync( outsideBuild, path.join( buildDir, 'demo.wasm' ), 'file' );

			const worker = {
				dir: path.join( project, 'workers', 'demo' ),
				manifest: { name: 'demo', entry: 'assembly/index.ts' },
			};

			expect( () => readPrebuiltWorker( project, worker ) ).toThrow(
				/Worker build artifact must not be a symbolic link/
			);
		} );
	} );
} );
