import fetch from 'node-fetch';
import { spawn } from 'node:child_process';
import { BinaryLike, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream, rmSync } from 'node:fs';
import { access, constants, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { format } from 'node:util';
import { createGunzip } from 'node:zlib';

import { createProxyAgent } from '../http/proxy-agent';

export class DownloadError extends Error {
	constructor( url: URL, code: number, options?: ErrorOptions ) {
		super( format( 'Failed to download file: %s (status code: %d)', url, code ), options );
		this.name = 'DownloadError';
	}
}

export class InvalidChecksumError extends Error {
	constructor( message?: string, options?: ErrorOptions ) {
		super( message, options );
		this.name = 'InvalidChecksumError';
	}
}

const archMap: Record< string, string > = {
	ia32: '386',
	x64: 'amd64',
	arm64: 'arm64',
};

const platformMap: Record< string, string > = {
	win32: 'windows',
	darwin: 'darwin',
	linux: 'linux',
};

export function getReleaseUrl(
	version = 'latest',
	arch: NodeJS.Architecture = process.arch,
	platform: NodeJS.Platform = process.platform
): [ string, string ] {
	const resolvedArch = archMap[ arch ];
	const resolvedPlatform = platformMap[ platform ];

	if ( ! resolvedArch || ! resolvedPlatform ) {
		throw new Error( 'Unsupported platform or architecture' );
	}

	const suffix = 'windows' === resolvedPlatform ? '.exe' : '';

	if ( version !== 'latest' ) {
		const binary = `https://github.com/Automattic/dev-env-update-hosts/releases/download/${ version }/dev-env-update-hosts-${ resolvedPlatform }-${ resolvedArch }${ suffix }.gz`;
		const checksum = `${ binary }.sum`;
		return [ binary, checksum ];
	}

	const binary = `https://github.com/Automattic/dev-env-update-hosts/releases/latest/download/dev-env-update-hosts-${ resolvedPlatform }-${ resolvedArch }${ suffix }.gz`;
	const checksum = `${ binary }.sum`;
	return [ binary, checksum ];
}

export async function download( url: URL, asText: true, timeout?: number ): Promise< string >;
export async function download(
	url: URL,
	asText: false,
	timeout?: number
): Promise< NodeJS.ReadableStream | null >;
export async function download(
	url: URL,
	asText: boolean,
	timeout = 0
): Promise< NodeJS.ReadableStream | string | null > {
	const controller = new AbortController();
	const timeoutId = timeout > 0 ? setTimeout( () => controller.abort(), timeout ) : null;
	const clearTimer = () => {
		if ( timeoutId ) {
			clearTimeout( timeoutId );
		}
	};
	const proxyAgent = createProxyAgent( url.toString() );

	let response: Awaited< ReturnType< typeof fetch > >;
	try {
		response = await fetch( url, {
			signal: controller.signal,
			redirect: 'follow',
			agent: proxyAgent ?? undefined,
		} );
	} catch ( err ) {
		clearTimer();
		throw err;
	}

	if ( ! response.ok ) {
		clearTimer();
		throw new DownloadError( url, response.status );
	}

	if ( asText ) {
		try {
			return await response.text();
		} finally {
			clearTimer();
		}
	}

	// For streams: unref the timer so it will not prevent process exit once the
	// body has been fully consumed, but it will still abort a stalled read while
	// the event loop is kept alive by the active stream pipeline.
	timeoutId?.unref();
	return response.body;
}

export function getExeName(
	platform: NodeJS.Platform = process.platform,
	arch: NodeJS.Architecture = process.arch
): string {
	const exeSuffix = platform === 'win32' ? '.exe' : '';
	return `dev-env-update-host-${ platform }-${ arch }${ exeSuffix }`;
}

export async function installBinary(
	version: string,
	dest: string,
	timeout = 0,
	arch = process.arch,
	platform = process.platform
): Promise< string > {
	const [ binaryUrl, checksumUrl ] = getReleaseUrl( version, arch, platform );
	const checksum = ( await download( new URL( checksumUrl ), true, timeout ) ).trim();
	const compressedStream = await download( new URL( binaryUrl ), false, timeout );

	if ( ! compressedStream ) {
		throw new Error( 'Failed to download binary' );
	}

	const hash = createHash( 'sha256' );
	const hashTap = new Transform( {
		transform( chunk: BinaryLike, _encoding, callback ) {
			hash.update( chunk );
			callback( null, chunk );
		},
	} );

	const destFilename = join( dest, getExeName( platform, arch ) );
	// Use a unique temp name to avoid collisions when multiple processes install concurrently.
	const tempFilename = `${ destFilename }.${ randomBytes( 8 ).toString( 'hex' ) }.tmp`;

	const outStream = createWriteStream( tempFilename, { mode: 0o755 } );
	let removeTmp = true;
	try {
		await pipeline( compressedStream, hashTap, createGunzip(), outStream );

		const calculatedChecksum = hash.digest( 'hex' );
		if (
			! timingSafeEqual( Buffer.from( calculatedChecksum, 'hex' ), Buffer.from( checksum, 'hex' ) )
		) {
			throw new InvalidChecksumError(
				format(
					'Downloaded file checksum does not match expected value (expected: %s, got: %s)',
					checksum,
					calculatedChecksum
				)
			);
		}

		await rename( tempFilename, destFilename );
		removeTmp = false;
	} finally {
		if ( removeTmp ) {
			await rm( tempFilename, { force: true } ).catch( err => {
				console.warn( 'Error removing temporary file %s: %s', tempFilename, err );
			} );
		}
	}

	return destFilename;
}

export async function getInstallDir(): Promise< string > {
	const binDir = join( dirname( __dirname ), 'bin' );
	try {
		await mkdir( binDir, { recursive: true } );
		await access( binDir, constants.W_OK );
		return binDir;
	} catch {
		// Swallow errors and fall back to a temporary directory
	}

	const tmpDir = await mkdtemp( join( tmpdir(), 'dev-env-update-hosts-' ) );
	process.once( 'exit', () => {
		try {
			rmSync( tmpDir, { recursive: true, force: true } );
		} catch ( err ) {
			console.warn( 'Error removing temporary dir: %s', err );
		}
	} );

	return tmpDir;
}

export function updateDomains( binary: string, domains: string[] ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( binary, domains, {
			stdio: 'inherit',
		} );

		child.on( 'error', err => reject( err ) );
		child.on( 'exit', code => {
			if ( code === 0 ) {
				resolve();
			} else {
				reject( new Error( `Binary exited with code ${ code }` ) );
			}
		} );
	} );
}
