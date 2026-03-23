import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import pkg from '../../../package.json';
import { xdgData } from '../xdg-data';

const RUNTIME_ARCHIVE_KEY = 'sea.node_modules.tgz';
const RUNTIME_DIR_NAME = 'sea-runtime';
const READY_FILE_NAME = '.ready';
const ARCHIVE_FILE_NAME = 'node_modules.tgz';

async function getSeaModule() {
	try {
		return await import( 'node:sea' );
	} catch {
		return null;
	}
}

function getRuntimeRootPath() {
	return path.join( xdgData(), 'vip', RUNTIME_DIR_NAME, pkg.version );
}

function getRuntimeNodeModulesPath( runtimeRootPath ) {
	return path.join( runtimeRootPath, 'node_modules' );
}

function getRuntimeReadyPath( runtimeRootPath ) {
	return path.join( runtimeRootPath, READY_FILE_NAME );
}

function appendNodePath( nodeModulesPath ) {
	const existing = process.env.NODE_PATH ? process.env.NODE_PATH.split( path.delimiter ) : [];
	if ( ! existing.includes( nodeModulesPath ) ) {
		process.env.NODE_PATH = [ nodeModulesPath, ...existing ].join( path.delimiter );
	}

	const Module = require( 'node:module' );
	Module.Module._initPaths();

	const runtimeEntryPath = path.join( nodeModulesPath, '..', '__sea-entry__.js' );
	const runtimeRequire = Module.createRequire( runtimeEntryPath );
	module.filename = runtimeEntryPath;
	module.paths = Module._nodeModulePaths( path.dirname( runtimeEntryPath ) );
	module.require = runtimeRequire;
}

async function extractRuntimeDependencies( runtimeRootPath, archiveBuffer ) {
	await rm( runtimeRootPath, { recursive: true, force: true } );
	await mkdir( runtimeRootPath, { recursive: true } );

	const archivePath = path.join( runtimeRootPath, ARCHIVE_FILE_NAME );
	await writeFile( archivePath, archiveBuffer );

	const tar = require( 'tar' );
	await tar.x( {
		file: archivePath,
		cwd: runtimeRootPath,
	} );

	await writeFile( getRuntimeReadyPath( runtimeRootPath ), pkg.version, 'utf8' );
}

export async function prepareSeaRuntimeFilesystem() {
	const sea = await getSeaModule();
	if ( ! sea?.isSea?.() || ! sea.getAsset ) {
		return;
	}

	const runtimeRootPath = getRuntimeRootPath();
	const runtimeNodeModulesPath = getRuntimeNodeModulesPath( runtimeRootPath );
	const runtimeReadyPath = getRuntimeReadyPath( runtimeRootPath );

	if ( ! existsSync( runtimeReadyPath ) || ! existsSync( runtimeNodeModulesPath ) ) {
		const archiveAsset = sea.getAsset( RUNTIME_ARCHIVE_KEY );
		const archiveBuffer = Buffer.isBuffer( archiveAsset )
			? archiveAsset
			: Buffer.from( archiveAsset );
		await extractRuntimeDependencies( runtimeRootPath, archiveBuffer );
	}

	appendNodePath( runtimeNodeModulesPath );
}
