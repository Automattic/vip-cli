import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	CONVENTIONAL_PROJECT_DIR,
	discoverWorkers,
	findWorker,
	readProjectDescriptor,
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

		it( 'finds a worker by name', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'alpha' );
			expect( findWorker( project, 'alpha' ).manifest.name ).toBe( 'alpha' );
		} );

		it( 'throws listing available workers when not found', () => {
			const project = makeProject( path.join( tmp, 'proj' ) );
			makeWorker( project, 'alpha' );
			expect( () => findWorker( project, 'nope' ) ).toThrow( /Available workers: alpha/ );
		} );
	} );
} );
