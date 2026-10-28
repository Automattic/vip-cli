import fs from 'node:fs';
import path from 'node:path';

import { loadConfigFile } from '../../../src/lib/cli/config';

describe( 'utils/cli/config', () => {
	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it.each( [
		{
			description: 'should return development if config.local.json is present',
			files: {
				'config.local.json': '{"environment":"development"}',
				'config.publish.json': '{"environment":"production"}',
			},
			expected: { environment: 'development' },
			reads: [ 'config.local.json' ],
		},
		{
			description: 'should return production if config.local.json is missing',
			files: { 'config.publish.json': '{"environment":"production"}' },
			expected: { environment: 'production' },
			reads: [ 'config.local.json', 'config.publish.json' ],
		},
		{
			description: 'should fall back to publish config when local JSON is invalid',
			files: { 'config.local.json': '{', 'config.publish.json': '{"environment":"production"}' },
			expected: { environment: 'production' },
			reads: [ 'config.local.json', 'config.publish.json' ],
		},
		{
			description: 'should throw error if config.local.json and config.publish.json are missing',
			files: {},
			expected: null,
			reads: [ 'config.local.json', 'config.publish.json' ],
		},
	] )( '$description', ( { files, expected, reads } ) => {
		const origReadFileSync = fs.readFileSync;
		const actualReads = [];
		jest.spyOn( fs, 'readFileSync' ).mockImplementation( ( filePath, ...params ) => {
			const fileName = typeof filePath === 'string' ? path.basename( filePath ) : '';
			if ( ! [ 'config.local.json', 'config.publish.json' ].includes( fileName ) ) {
				return origReadFileSync( filePath, ...params );
			}
			actualReads.push( fileName );
			if ( ! Object.hasOwn( files, fileName ) ) {
				throw new Error();
			}
			return files[ fileName ];
		} );

		const actual = loadConfigFile();
		expect( actual ).toStrictEqual( expected );
		expect( actualReads ).toEqual( reads );
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
