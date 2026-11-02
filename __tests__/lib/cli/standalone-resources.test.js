import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { c as createTar } from 'tar';

import {
	getBundledResourceRoot,
	getBundledSearchReplaceBinary,
	loadBundledPackage,
	resolveBundledModule,
} from '../../../src/lib/cli/standalone-resources';

describe( 'standalone runtime resources', () => {
	it( 'loads packages and companion from a physical child root without an archive', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-child-resources-test-' ) );
		const packageDir = path.join( root, 'node_modules', 'fixture-child-package' );
		const binaryName = process.platform === 'win32' ? 'go-search-replace.exe' : 'go-search-replace';
		const previousRoot = globalThis.__VIP_BUNDLED_RESOURCE_ROOT__;
		const previousArchive = globalThis.__VIP_BUNDLED_ARCHIVE_PATH__;
		const previousDigest = globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__;
		const previousBun = globalThis.Bun;

		try {
			fs.mkdirSync( path.join( root, 'config' ), { recursive: true } );
			fs.mkdirSync( packageDir, { recursive: true } );
			fs.mkdirSync( path.join( root, 'bin' ), { recursive: true } );
			fs.writeFileSync( path.join( root, 'config', 'config.publish.json' ), '{}' );
			fs.writeFileSync( path.join( packageDir, 'index.js' ), 'module.exports = "child";\n' );
			fs.writeFileSync( path.join( root, 'bin', binaryName ), 'fixture binary\n' );
			globalThis.__VIP_BUNDLED_RESOURCE_ROOT__ = root;
			delete globalThis.__VIP_BUNDLED_ARCHIVE_PATH__;
			delete globalThis.Bun;

			jest.isolateModules( () => {
				const resources = require( '../../../src/lib/cli/standalone-resources' );
				expect( resources.getBundledResourceRoot() ).toBe( root );
				expect( resources.loadBundledPackage( 'fixture-child-package' ) ).toBe( 'child' );
				expect( resources.getBundledSearchReplaceBinary() ).toBe(
					path.join( root, 'bin', binaryName )
				);
			} );
		} finally {
			globalThis.__VIP_BUNDLED_RESOURCE_ROOT__ = previousRoot;
			globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = previousArchive;
			globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = previousDigest;
			globalThis.Bun = previousBun;
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );

	it( 'rejects an incomplete physical child root', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-incomplete-root-test-' ) );
		const previousRoot = globalThis.__VIP_BUNDLED_RESOURCE_ROOT__;
		try {
			globalThis.__VIP_BUNDLED_RESOURCE_ROOT__ = root;
			jest.isolateModules( () => {
				const resources = require( '../../../src/lib/cli/standalone-resources' );
				expect( () => resources.getBundledResourceRoot() ).toThrow(
					'Standalone VIP resource root is incomplete.'
				);
			} );
		} finally {
			globalThis.__VIP_BUNDLED_RESOURCE_ROOT__ = previousRoot;
			fs.rmSync( root, { recursive: true, force: true } );
		}
	} );

	it.each( [ undefined, '../escape', 'g'.repeat( 64 ) ] )(
		'rejects invalid embedded archive digest %s before reading the archive',
		digest => {
			const previousBun = globalThis.Bun;
			const previousArchive = globalThis.__VIP_BUNDLED_ARCHIVE_PATH__;
			const previousDigest = globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__;
			try {
				globalThis.Bun = { isStandaloneExecutable: true };
				globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = '/unreadable/runtime.tar.gz';
				globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = digest;
				jest.isolateModules( () => {
					const resources = require( '../../../src/lib/cli/standalone-resources' );
					expect( () => resources.getBundledResourceRoot() ).toThrow(
						'digest is missing or invalid'
					);
				} );
			} finally {
				globalThis.Bun = previousBun;
				globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = previousArchive;
				globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = previousDigest;
			}
		}
	);

	it( 'rejects archive bytes that do not match the embedded digest without extracting them', () => {
		const scope = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-digest-test-' ) );
		const previousCacheHome = process.env.XDG_CACHE_HOME;
		const previousBun = globalThis.Bun;
		const previousArchive = globalThis.__VIP_BUNDLED_ARCHIVE_PATH__;
		const previousDigest = globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__;
		try {
			process.env.XDG_CACHE_HOME = path.join( scope, 'cache' );
			globalThis.Bun = { isStandaloneExecutable: true };
			globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = path.join( scope, 'archive.tar.gz' );
			globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = '0'.repeat( 64 );
			fs.writeFileSync( globalThis.__VIP_BUNDLED_ARCHIVE_PATH__, 'altered bytes' );
			jest.isolateModules( () => {
				const resources = require( '../../../src/lib/cli/standalone-resources' );
				expect( () => resources.getBundledResourceRoot() ).toThrow(
					'digest does not match its contents'
				);
			} );
			expect(
				fs.readdirSync( path.join( scope, 'cache', 'vip-cli', 'standalone-resources' ) )
			).toEqual( [] );
		} finally {
			if ( previousCacheHome === undefined ) delete process.env.XDG_CACHE_HOME;
			else process.env.XDG_CACHE_HOME = previousCacheHome;
			globalThis.Bun = previousBun;
			globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = previousArchive;
			globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = previousDigest;
			fs.rmSync( scope, { recursive: true, force: true } );
		}
	} );

	it( 'extracts a bundled package, template, and companion into a stable cache', () => {
		const fixtureRoot = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-resources-test-' ) );
		const inputRoot = path.join( fixtureRoot, 'input' );
		const packageDir = path.join( inputRoot, 'node_modules', 'fixture-package' );
		const assetsDir = path.join( inputRoot, 'assets' );
		const binDir = path.join( inputRoot, 'bin' );
		const archivePath = path.join( fixtureRoot, 'runtime.tar.gz' );
		const previousCacheHome = process.env.XDG_CACHE_HOME;
		const previousBun = globalThis.Bun;
		const previousArchive = globalThis.__VIP_BUNDLED_ARCHIVE_PATH__;
		const previousDigest = globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__;

		try {
			fs.mkdirSync( packageDir, { recursive: true } );
			fs.mkdirSync( assetsDir, { recursive: true } );
			fs.mkdirSync( binDir, { recursive: true } );
			fs.writeFileSync(
				path.join( packageDir, 'index.js' ),
				'module.exports = { marker: "loaded" };\n'
			);
			fs.writeFileSync( path.join( assetsDir, 'template.ejs' ), '<%= marker %>\n' );
			const binaryName =
				process.platform === 'win32' ? 'go-search-replace.exe' : 'go-search-replace';
			fs.writeFileSync( path.join( binDir, binaryName ), 'fixture binary\n' );
			createTar( { cwd: inputRoot, file: archivePath, gzip: true, sync: true }, [
				'node_modules',
				'assets',
				'bin',
			] );

			process.env.XDG_CACHE_HOME = path.join( fixtureRoot, 'cache' );
			globalThis.Bun = { isStandaloneExecutable: true };
			globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = archivePath;
			globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = createHash( 'sha256' )
				.update( fs.readFileSync( archivePath ) )
				.digest( 'hex' );

			const root = getBundledResourceRoot();
			expect( root ).toBeTruthy();
			expect( fs.readFileSync( path.join( root, 'assets', 'template.ejs' ), 'utf8' ) ).toBe(
				'<%= marker %>\n'
			);
			expect( loadBundledPackage( 'fixture-package' ) ).toEqual( { marker: 'loaded' } );
			expect( resolveBundledModule( 'fixture-package' ) ).toBe(
				path.join( root, 'node_modules', 'fixture-package', 'index.js' )
			);
			expect( getBundledSearchReplaceBinary() ).toBe( path.join( root, 'bin', binaryName ) );
			expect( getBundledResourceRoot() ).toBe( root );

			// Simulate a separate process reusing the cache with an unreadable archive.
			const read = fs.readFileSync;
			const spy = jest.spyOn( fs, 'readFileSync' ).mockImplementation( ( filename, ...args ) => {
				if ( filename === archivePath )
					throw new Error( 'Archive must not be read on a cache hit' );
				return read( filename, ...args );
			} );
			try {
				jest.isolateModules( () => {
					const resources = require( '../../../src/lib/cli/standalone-resources' );
					expect( resources.getBundledResourceRoot() ).toBe( root );
				} );
			} finally {
				spy.mockRestore();
			}
		} finally {
			if ( previousCacheHome === undefined ) {
				delete process.env.XDG_CACHE_HOME;
			} else {
				process.env.XDG_CACHE_HOME = previousCacheHome;
			}
			globalThis.Bun = previousBun;
			globalThis.__VIP_BUNDLED_ARCHIVE_PATH__ = previousArchive;
			globalThis.__VIP_BUNDLED_ARCHIVE_SHA256__ = previousDigest;
			fs.rmSync( fixtureRoot, { recursive: true, force: true } );
		}
	} );
} );
