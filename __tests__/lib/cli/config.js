import fs from 'node:fs';

import { loadConfigFile } from '../../../src/lib/cli/config';

describe( 'utils/cli/config', () => {
	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it.each( [
		{
			description: 'should return development if config.local.json is present',
			files: { local: true, publish: true },
			expected: { environment: 'development' },
		},
		{
			description: 'should return production if config.local.json is missing',
			files: { local: false, publish: true },
			expected: { environment: 'production' },
		},
		{
			description: 'should throw error if config.local.json and config.publish.json are missing',
			files: { local: false, publish: false },
			expected: null,
		},
	] )( '$description', ( { files, expected } ) => {
		const origReadFileSync = fs.readFileSync;
		jest.spyOn( fs, 'readFileSync' ).mockImplementation( ( filePath, ...params ) => {
			if ( typeof filePath !== 'string' || ! filePath.includes( 'config.' ) ) {
				return origReadFileSync( filePath, ...params );
			}

			if (
				( filePath.includes( 'config.local.json' ) && ! files.local ) ||
				( filePath.includes( 'config.publish.json' ) && ! files.publish )
			) {
				throw new Error();
			}

			return JSON.stringify( expected );
		} );

		const actual = loadConfigFile();
		expect( actual ).toStrictEqual( expected );
	} );

	it( 'should return null when both config files are missing with ENOENT', () => {
		const origReadFileSync = fs.readFileSync;
		jest.spyOn( fs, 'readFileSync' ).mockImplementation( ( filePath, ...params ) => {
			if ( typeof filePath !== 'string' || ! filePath.includes( 'config.' ) ) {
				return origReadFileSync( filePath, ...params );
			}

			const error = new Error( 'File not found' );
			error.code = 'ENOENT';
			throw error;
		} );

		expect( loadConfigFile() ).toBeNull();
	} );
} );
