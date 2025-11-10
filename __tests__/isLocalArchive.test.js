import fs from 'fs';
import os from 'os';
import path from 'path';

import { isLocalArchive } from '../src/lib/media-import/utils';

describe( 'isLocalArchive', () => {
	let tmpDir;

	beforeAll( () => {
		tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'isLocalArchive-' ) );
	} );

	afterAll( () => {
		// cleanup
		fs.readdirSync( tmpDir ).forEach( fileName => fs.unlinkSync( path.join( tmpDir, fileName ) ) );
		fs.rmdirSync( tmpDir );
	} );

	test( 'returns true for .tar.gz file that exists', () => {
		const archivePath = path.join( tmpDir, 'test-archive.tar.gz' );
		fs.writeFileSync( archivePath, 'data' );
		expect( isLocalArchive( archivePath ) ).toBe( true );
	} );

	test( 'returns true for .tgz file that exists', () => {
		const tgzPath = path.join( tmpDir, 'test-archive.tgz' );
		fs.writeFileSync( tgzPath, 'data' );
		expect( isLocalArchive( tgzPath ) ).toBe( true );
	} );

	test( 'returns true for .zip file that exists', () => {
		const zipPath = path.join( tmpDir, 'test-archive.zip' );
		fs.writeFileSync( zipPath, 'data' );
		expect( isLocalArchive( zipPath ) ).toBe( true );
	} );

	test( 'returns false for file that does not exist', () => {
		const missingPath = path.join( tmpDir, 'nope.tar.gz' );
		expect( isLocalArchive( missingPath ) ).toBe( false );
	} );

	test( 'returns false for non-archive extension', () => {
		const textPath = path.join( tmpDir, 'not-archive.txt' );
		fs.writeFileSync( textPath, 'data' );
		expect( isLocalArchive( textPath ) ).toBe( false );
	} );
} );
