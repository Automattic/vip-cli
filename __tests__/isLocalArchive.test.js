import fs from 'fs';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { isLocalArchive } from '../src/lib/media-import/utils';

describe( 'isLocalArchive', () => {
	/** @type {string} */
	let tmpDir;

	beforeAll( () =>
		mkdtemp( path.join( tmpdir(), 'isLocalArchive-' ) ).then( dir => {
			tmpDir = dir;
		} )
	);

	afterAll( () => rm( tmpDir, { recursive: true, force: true } ) );

	test( 'returns true for .tar.gz file that exists', () => {
		const archivePath = path.join( tmpDir, 'test-archive.tar.gz' );
		fs.writeFileSync( archivePath, 'data' );
		return expect( isLocalArchive( archivePath ) ).resolves.toBe( true );
	} );

	test( 'returns true for .tgz file that exists', () => {
		const tgzPath = path.join( tmpDir, 'test-archive.tgz' );
		fs.writeFileSync( tgzPath, 'data' );
		return expect( isLocalArchive( tgzPath ) ).resolves.toBe( true );
	} );

	test( 'returns true for .zip file that exists', () => {
		const zipPath = path.join( tmpDir, 'test-archive.zip' );
		fs.writeFileSync( zipPath, 'data' );
		return expect( isLocalArchive( zipPath ) ).resolves.toBe( true );
	} );

	test( 'returns false for file that does not exist', () => {
		const missingPath = path.join( tmpDir, 'nope.tar.gz' );
		return expect( isLocalArchive( missingPath ) ).resolves.toBe( false );
	} );

	test( 'returns false for non-archive extension', () => {
		const textPath = path.join( tmpDir, 'not-archive.txt' );
		fs.writeFileSync( textPath, 'data' );
		return expect( isLocalArchive( textPath ) ).resolves.toBe( false );
	} );
} );
