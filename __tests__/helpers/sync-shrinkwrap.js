/**
 * @format
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { syncShrinkwrap } from '../../helpers/sync-shrinkwrap.js';

describe( 'syncShrinkwrap', () => {
	const tempDirs = [];
	const makeTempDir = () => {
		const tempDir = mkdtempSync( path.join( tmpdir(), 'vip-cli-shrinkwrap-' ) );
		tempDirs.push( tempDir );
		return tempDir;
	};

	afterEach( () => {
		for ( const tempDir of tempDirs.splice( 0 ) ) {
			rmSync( tempDir, { recursive: true, force: true } );
		}
	} );

	it( 'copies package-lock.json to npm-shrinkwrap.json byte-for-byte', () => {
		const cwd = makeTempDir();
		const lockfile = '{\n  "lockfileVersion": 3\n}\n';
		writeFileSync( path.join( cwd, 'package-lock.json' ), lockfile );

		syncShrinkwrap( { cwd } );

		expect( readFileSync( path.join( cwd, 'npm-shrinkwrap.json' ), 'utf8' ) ).toBe( lockfile );
	} );

	it( 'accepts identical lockfiles in check mode', () => {
		const cwd = makeTempDir();
		const lockfile = '{\n  "lockfileVersion": 3\n}\n';
		writeFileSync( path.join( cwd, 'package-lock.json' ), lockfile );
		writeFileSync( path.join( cwd, 'npm-shrinkwrap.json' ), lockfile );

		expect( () => syncShrinkwrap( { cwd, check: true } ) ).not.toThrow();
	} );

	it( 'rejects stale shrinkwrap files in check mode', () => {
		const cwd = makeTempDir();
		writeFileSync( path.join( cwd, 'package-lock.json' ), '{ "version": "2.0.0" }\n' );
		writeFileSync( path.join( cwd, 'npm-shrinkwrap.json' ), '{ "version": "1.0.0" }\n' );

		expect( () => syncShrinkwrap( { cwd, check: true } ) ).toThrow(
			'npm-shrinkwrap.json is out of sync with package-lock.json'
		);
	} );
} );
