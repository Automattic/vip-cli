import { rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isLocalArchive } from '../src/lib/media-import/utils';

describe( 'isLocalArchive', () => {
	/** @type {string} */
	let tmpDir;

	beforeAll( () =>
		mkdtemp( join( tmpdir(), 'isLocalArchive-' ) ).then( dir => {
			tmpDir = dir;
		} )
	);

	afterAll( () => rm( tmpDir, { recursive: true, force: true } ) );

	test.each( [
		[ true, 'test-archive.tar.gz' ],
		[ true, 'test-archive.tgz' ],
		[ true, 'test-archive.zip' ],
		[ false, 'not-archive.txt' ],
	] )( 'returns %j for existing %s', async ( expected, filename ) => {
		const archivePath = join( tmpDir, filename );
		await writeFile( archivePath, 'data' );
		return expect( isLocalArchive( archivePath ) ).resolves.toBe( expected );
	} );

	test( 'returns false for file that does not exist', () => {
		const missingPath = join( tmpDir, 'nope.tar.gz' );
		return expect( isLocalArchive( missingPath ) ).resolves.toBe( false );
	} );
} );
