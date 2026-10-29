import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { x as extractTar } from 'tar';

type StandaloneGlobal = typeof globalThis & {
	Bun?: { isStandaloneExecutable?: boolean };
	__VIP_BUNDLED_ARCHIVE_PATH__?: string;
	__VIP_BUNDLED_RESOURCE_ROOT__?: string;
};

let resourceRoot: string | null | undefined;

function cacheHome(): string {
	if ( process.env.XDG_CACHE_HOME && path.isAbsolute( process.env.XDG_CACHE_HOME ) ) {
		return process.env.XDG_CACHE_HOME;
	}
	if ( process.platform === 'win32' ) {
		return process.env.LOCALAPPDATA || path.join( os.homedir(), 'AppData', 'Local' );
	}
	if ( process.platform === 'darwin' ) {
		return path.join( os.homedir(), 'Library', 'Caches' );
	}
	return path.join( os.homedir(), '.cache' );
}

function ownedDirectory( directory: string ): boolean {
	try {
		const entry = fs.lstatSync( directory );
		if ( ! entry.isDirectory() || entry.isSymbolicLink() ) {
			return false;
		}
		if ( typeof process.getuid === 'function' && entry.uid !== process.getuid() ) {
			return false;
		}
		// A different local user must not be able to replace executable runtime files.
		// eslint-disable-next-line no-bitwise
		return process.platform === 'win32' || ( entry.mode & 0o022 ) === 0;
	} catch {
		return false;
	}
}

function validCache( root: string, digest: string ): boolean {
	try {
		return (
			ownedDirectory( root ) &&
			fs.readFileSync( path.join( root, '.archive-sha256' ), 'utf8' ) === digest
		);
	} catch {
		return false;
	}
}

/**
 * A Bun executable embeds one archive of runtime files that must retain their
 * package layout (Lando plugins, native addons, and templates). Dynamic CommonJS
 * loading and child-process execution require real, writable filesystem paths.
 */
export function getBundledResourceRoot(): string | null {
	if ( resourceRoot !== undefined ) {
		return resourceRoot;
	}

	const runtime = globalThis as StandaloneGlobal;
	if ( runtime.__VIP_BUNDLED_RESOURCE_ROOT__ ) {
		const root = fs.realpathSync( runtime.__VIP_BUNDLED_RESOURCE_ROOT__ );
		if (
			! fs.statSync( root ).isDirectory() ||
			! fs
				.statSync( path.join( root, 'dist', 'bin', 'vip.js' ), { throwIfNoEntry: false } )
				?.isFile()
		) {
			throw new Error( 'Standalone VIP resource root is incomplete.' );
		}
		resourceRoot = root;
		return root;
	}
	if ( ! runtime.Bun?.isStandaloneExecutable ) {
		resourceRoot = null;
		return resourceRoot;
	}

	const archivePath = runtime.__VIP_BUNDLED_ARCHIVE_PATH__;
	if ( ! archivePath ) {
		throw new Error( 'Standalone VIP runtime archive is missing from the executable.' );
	}

	const archive = fs.readFileSync( archivePath );
	const digest = createHash( 'sha256' ).update( archive ).digest( 'hex' );
	const cacheDir = path.join( cacheHome(), 'vip-cli', 'standalone-resources' );
	const root = path.join( cacheDir, digest );
	fs.mkdirSync( cacheDir, { recursive: true, mode: 0o700 } );
	if ( ! ownedDirectory( path.dirname( cacheDir ) ) || ! ownedDirectory( cacheDir ) ) {
		throw new Error( `Standalone VIP cache directory is not private: ${ cacheDir }` );
	}
	if ( validCache( root, digest ) ) {
		resourceRoot = root;
		return root;
	}

	const staging = path.join( cacheDir, `.staging-${ process.pid }-${ randomUUID() }` );
	fs.mkdirSync( staging, { mode: 0o700 } );
	try {
		const physicalArchive = path.join( staging, 'resources.tar.gz' );
		fs.writeFileSync( physicalArchive, archive, { mode: 0o600 } );
		extractTar( { cwd: staging, file: physicalArchive, sync: true, strict: true } );
		fs.unlinkSync( physicalArchive );
		fs.writeFileSync( path.join( staging, '.archive-sha256' ), digest, { mode: 0o600 } );
		try {
			fs.renameSync( staging, root );
		} catch ( error ) {
			if ( ! validCache( root, digest ) ) {
				throw error;
			}
			fs.rmSync( staging, { recursive: true, force: true } );
		}
	} catch ( error ) {
		fs.rmSync( staging, { recursive: true, force: true } );
		throw error;
	}

	resourceRoot = root;
	return root;
}

export function loadBundledPackage< T >( request: string ): T {
	const root = getBundledResourceRoot();
	if ( ! root ) {
		throw new Error( 'Bundled module requested outside a standalone executable.' );
	}
	return createRequire( path.join( root, '__vip_loader__.cjs' ) )( request ) as T;
}

export function getBundledSearchReplaceBinary(): string | null {
	const root = getBundledResourceRoot();
	if ( ! root ) {
		return null;
	}
	const name = process.platform === 'win32' ? 'go-search-replace.exe' : 'go-search-replace';
	const binary = path.join( root, 'bin', name );
	if ( ! fs.statSync( binary, { throwIfNoEntry: false } )?.isFile() ) {
		throw new Error( `Standalone search-replace binary is missing: ${ binary }` );
	}
	return binary;
}

export function resolveBundledModule( request: string ): string {
	const root = getBundledResourceRoot();
	if ( ! root ) {
		throw new Error( 'Bundled module requested outside a standalone executable.' );
	}
	return createRequire( path.join( root, '__vip_loader__.cjs' ) ).resolve( request );
}
