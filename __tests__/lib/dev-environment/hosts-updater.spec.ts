import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fetch from 'node-fetch';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

jest.mock( 'node-fetch' );
jest.mock( '../../../src/lib/http/proxy-agent', () => ( {
	createProxyAgent: jest.fn( () => null ),
} ) );
jest.mock( 'node:child_process', () => ( {
	...jest.requireActual< object >( 'node:child_process' ),
	spawn: jest.fn(),
} ) );
jest.mock( 'node:fs', () => ( {
	...jest.requireActual< object >( 'node:fs' ),
	createWriteStream: jest.fn(),
	rmSync: jest.fn(),
} ) );
jest.mock( 'node:fs/promises', () => ( {
	...jest.requireActual< object >( 'node:fs/promises' ),
	access: jest.fn(),
	mkdir: jest.fn(),
	mkdtemp: jest.fn(),
	rename: jest.fn(),
	rm: jest.fn(),
} ) );
jest.mock( 'node:stream/promises', () => ( {
	...jest.requireActual< object >( 'node:stream/promises' ),
	pipeline: jest.fn(),
} ) );

import {
	DownloadError,
	InvalidChecksumError,
	download,
	getExeName,
	getInstallDir,
	getReleaseUrl,
	installBinary,
	updateDomains,
} from '../../../src/lib/dev-environment/hosts-updater';

const mockedFetch = jest.mocked( fetch );
const mockedSpawn = jest.mocked( spawn );
const mockedCreateWriteStream = jest.mocked( createWriteStream );
const mockedAccess = jest.mocked( access );
const mockedMkdir = jest.mocked( mkdir );
const mockedMkdtemp = jest.mocked( mkdtemp );
const mockedRename = jest.mocked( rename );
const mockedRm = jest.mocked( rm );
const mockedPipeline = jest.mocked( pipeline );

describe( 'getReleaseUrl', () => {
	it( 'returns latest download URLs when version is "latest"', () => {
		const [ binary, checksum ] = getReleaseUrl( 'latest', 'x64', 'linux' );
		expect( binary ).toBe(
			'https://github.com/Automattic/dev-env-update-hosts/releases/latest/download/dev-env-update-hosts-linux-amd64.gz'
		);
		expect( checksum ).toBe( `${ binary }.sum` );
	} );

	it( 'returns versioned download URLs when a specific version is given', () => {
		const [ binary, checksum ] = getReleaseUrl( 'v1.2.3', 'x64', 'linux' );
		expect( binary ).toBe(
			'https://github.com/Automattic/dev-env-update-hosts/releases/download/v1.2.3/dev-env-update-hosts-linux-amd64.gz'
		);
		expect( checksum ).toBe( `${ binary }.sum` );
	} );

	it( 'adds .exe suffix on windows', () => {
		const [ binary ] = getReleaseUrl( 'v1.0.0', 'x64', 'win32' );
		expect( binary ).toMatch( /\.exe\.gz$/ );
	} );

	it( 'maps arm64 architecture correctly', () => {
		const [ binary ] = getReleaseUrl( 'latest', 'arm64', 'darwin' );
		expect( binary ).toContain( 'darwin-arm64' );
	} );

	it( 'maps ia32 architecture to 386', () => {
		const [ binary ] = getReleaseUrl( 'latest', 'ia32' as NodeJS.Architecture, 'linux' );
		expect( binary ).toContain( 'linux-386' );
	} );

	it( 'throws for unsupported architecture', () => {
		expect( () => getReleaseUrl( 'latest', 'mips' as NodeJS.Architecture, 'linux' ) ).toThrow(
			'Unsupported platform or architecture'
		);
	} );

	it( 'throws for unsupported platform', () => {
		expect( () => getReleaseUrl( 'latest', 'x64', 'freebsd' as NodeJS.Platform ) ).toThrow(
			'Unsupported platform or architecture'
		);
	} );
} );

describe( 'getExeName', () => {
	it( 'returns arch-specific name on linux', () => {
		expect( getExeName( 'linux', 'x64' ) ).toBe( 'dev-env-update-host-linux-x64' );
	} );

	it( 'returns arch-specific name on darwin', () => {
		expect( getExeName( 'darwin', 'arm64' ) ).toBe( 'dev-env-update-host-darwin-arm64' );
	} );

	it( 'returns arch-specific .exe name on win32', () => {
		expect( getExeName( 'win32', 'x64' ) ).toBe( 'dev-env-update-host-win32-x64.exe' );
	} );
} );

describe( 'download', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'returns text when asText is true', async () => {
		mockedFetch.mockResolvedValue( {
			ok: true,
			text: jest.fn< () => Promise< string > >().mockResolvedValue( 'checksum-value' ),
		} as unknown as Awaited< ReturnType< typeof fetch > > );

		const result = await download( new URL( 'https://example.com/file.sum' ), true );
		expect( result ).toBe( 'checksum-value' );
	} );

	it( 'returns a readable stream when asText is false', async () => {
		const stream = Readable.from( [ Buffer.from( 'data' ) ] );
		mockedFetch.mockResolvedValue( {
			ok: true,
			body: stream,
		} as unknown as Awaited< ReturnType< typeof fetch > > );

		const result = await download( new URL( 'https://example.com/file.gz' ), false );
		expect( result ).toBe( stream );
	} );

	it( 'throws DownloadError when response is not ok', async () => {
		mockedFetch.mockResolvedValue( {
			ok: false,
			status: 404,
		} as unknown as Awaited< ReturnType< typeof fetch > > );

		await expect(
			download( new URL( 'https://example.com/missing.gz' ), false )
		).rejects.toBeInstanceOf( DownloadError );
	} );

	it( 'DownloadError includes the status code', async () => {
		mockedFetch.mockResolvedValue( {
			ok: false,
			status: 403,
		} as unknown as Awaited< ReturnType< typeof fetch > > );

		await expect(
			download( new URL( 'https://example.com/forbidden.gz' ), false )
		).rejects.toThrow( '403' );
	} );

	it( 'aborts when the timeout elapses', async () => {
		jest.useFakeTimers();

		mockedFetch.mockImplementation(
			( _url: unknown, opts?: unknown ) =>
				new Promise< Awaited< ReturnType< typeof fetch > > >( ( _resolve, reject ) => {
					const { signal } = opts as { signal: AbortSignal };
					signal.addEventListener( 'abort', () =>
						reject( new DOMException( 'Aborted', 'AbortError' ) )
					);
				} )
		);

		const promise = download( new URL( 'https://example.com/slow.gz' ), false, 100 );
		jest.advanceTimersByTime( 200 );
		await expect( promise ).rejects.toThrow();

		jest.useRealTimers();
	} );
} );

describe( 'installBinary', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'downloads, validates checksum, and renames the file on success', async () => {
		// sha256 of empty string — pipeline is mocked to no-op so no data flows through the hash
		const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

		mockedFetch
			.mockResolvedValueOnce( {
				ok: true,
				text: jest.fn< () => Promise< string > >().mockResolvedValue( `${ emptyHash }  file\n` ),
			} as unknown as Awaited< ReturnType< typeof fetch > > )
			.mockResolvedValueOnce( {
				ok: true,
				body: Readable.from( [] ),
			} as unknown as Awaited< ReturnType< typeof fetch > > );

		mockedCreateWriteStream.mockReturnValue( {} as ReturnType< typeof createWriteStream > );
		mockedPipeline.mockResolvedValue();
		mockedRename.mockResolvedValue();

		const dest = '/tmp/test-dir';
		const expectedBinary = path.join( dest, 'dev-env-update-host-linux-x64' );
		const result = await installBinary( 'v1.0.0', dest, 0, 'x64', 'linux' );
		expect( result ).toBe( expectedBinary );
		// Temp file has a random suffix; capture the actual name from the createWriteStream call
		const tempFile = mockedCreateWriteStream.mock.calls[ 0 ][ 0 ] as string;
		expect( tempFile ).toMatch( /dev-env-update-host-linux-x64\.[0-9a-f]+\.tmp$/ );
		expect( mockedRename ).toHaveBeenCalledWith( tempFile, expectedBinary );
	} );

	it( 'removes the temp file and throws InvalidChecksumError when checksum does not match', async () => {
		const wrongChecksum = 'a'.repeat( 64 );

		mockedFetch
			.mockResolvedValueOnce( {
				ok: true,
				text: jest
					.fn< () => Promise< string > >()
					.mockResolvedValue( `${ wrongChecksum }  file\n` ),
			} as unknown as Awaited< ReturnType< typeof fetch > > )
			.mockResolvedValueOnce( {
				ok: true,
				body: Readable.from( [] ),
			} as unknown as Awaited< ReturnType< typeof fetch > > );

		mockedCreateWriteStream.mockReturnValue( {} as ReturnType< typeof createWriteStream > );
		mockedPipeline.mockResolvedValue();
		mockedRm.mockResolvedValue();
		mockedRename.mockResolvedValue();

		await expect(
			installBinary( 'v1.0.0', '/tmp/test-dir', 0, 'x64', 'linux' )
		).rejects.toBeInstanceOf( InvalidChecksumError );

		// Temp file (with random suffix) must be cleaned up on checksum failure
		const tempFile = mockedCreateWriteStream.mock.calls[ 0 ][ 0 ] as string;
		expect( mockedRm ).toHaveBeenCalledWith( tempFile, { force: true } );
		// Rename must NOT have been called
		expect( mockedRename ).not.toHaveBeenCalled();
	} );

	it( 'removes the temp file when pipeline fails', async () => {
		mockedFetch
			.mockResolvedValueOnce( {
				ok: true,
				text: jest.fn< () => Promise< string > >().mockResolvedValue( 'abc123  file\n' ),
			} as unknown as Awaited< ReturnType< typeof fetch > > )
			.mockResolvedValueOnce( {
				ok: true,
				body: Readable.from( [] ),
			} as unknown as Awaited< ReturnType< typeof fetch > > );

		mockedCreateWriteStream.mockReturnValue( {} as ReturnType< typeof createWriteStream > );
		mockedPipeline.mockRejectedValue( new Error( 'network reset' ) );
		mockedRm.mockResolvedValue();

		await expect( installBinary( 'v1.0.0', '/tmp/test-dir', 0, 'x64', 'linux' ) ).rejects.toThrow(
			'network reset'
		);

		// Temp file (with random suffix) must be cleaned up when pipeline fails
		const tempFile = mockedCreateWriteStream.mock.calls[ 0 ][ 0 ] as string;
		expect( tempFile ).toMatch( /dev-env-update-host-linux-x64\.[0-9a-f]+\.tmp$/ );
		expect( mockedRm ).toHaveBeenCalledWith( tempFile, { force: true } );
		expect( mockedRename ).not.toHaveBeenCalled();
	} );

	it( 'throws when the binary download returns null body', async () => {
		mockedFetch
			.mockResolvedValueOnce( {
				ok: true,
				text: jest.fn< () => Promise< string > >().mockResolvedValue( 'abc123' ),
			} as unknown as Awaited< ReturnType< typeof fetch > > )
			.mockResolvedValueOnce( {
				ok: true,
				body: null,
			} as unknown as Awaited< ReturnType< typeof fetch > > );

		await expect( installBinary( 'v1.0.0', '/tmp/test-dir', 0, 'x64', 'linux' ) ).rejects.toThrow(
			'Failed to download binary'
		);
		// No temp file should have been created
		expect( mockedCreateWriteStream ).not.toHaveBeenCalled();
	} );

	it( 'throws DownloadError when checksum download fails', async () => {
		mockedFetch.mockResolvedValueOnce( {
			ok: false,
			status: 503,
		} as unknown as Awaited< ReturnType< typeof fetch > > );

		await expect(
			installBinary( 'v1.0.0', '/tmp/test-dir', 0, 'x64', 'linux' )
		).rejects.toBeInstanceOf( DownloadError );
	} );
} );

describe( 'getInstallDir', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'returns the bin directory when it is writable', async () => {
		mockedMkdir.mockResolvedValue( undefined );
		mockedAccess.mockResolvedValue();

		const dir = await getInstallDir();
		expect( dir ).toMatch( /[\\/]bin$/ );
	} );

	it( 'falls back to a temp dir when mkdir fails', async () => {
		mockedMkdir.mockRejectedValue( new Error( 'EACCES' ) );
		mockedAccess.mockRejectedValue( new Error( 'EACCES' ) );
		mockedMkdtemp.mockResolvedValue( '/tmp/dev-env-update-hosts-abc123' );

		const dir = await getInstallDir();
		expect( dir ).toBe( '/tmp/dev-env-update-hosts-abc123' );
		expect( mockedMkdtemp ).toHaveBeenCalled();
	} );

	it( 'falls back to a temp dir when the bin directory is not writable', async () => {
		mockedMkdir.mockResolvedValue( undefined );
		mockedAccess.mockRejectedValue(
			Object.assign( new Error( 'EACCES: permission denied' ), { code: 'EACCES' } )
		);
		mockedMkdtemp.mockResolvedValue( '/tmp/dev-env-update-hosts-xyz789' );

		const dir = await getInstallDir();
		expect( dir ).toBe( '/tmp/dev-env-update-hosts-xyz789' );
	} );
} );

describe( 'updateDomains', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	function makeChildProcess( exitCode: number | null, errorEvent?: Error ) {
		const emitter = new EventEmitter();
		setImmediate( () => {
			if ( errorEvent ) {
				emitter.emit( 'error', errorEvent );
			} else {
				emitter.emit( 'exit', exitCode );
			}
		} );
		return emitter;
	}

	it( 'resolves when the binary exits with code 0', async () => {
		mockedSpawn.mockReturnValue( makeChildProcess( 0 ) as unknown as ReturnType< typeof spawn > );

		await expect(
			updateDomains( '/usr/local/bin/updater', [ 'example.lndo.site' ] )
		).resolves.toBeUndefined();
	} );

	it( 'rejects when the binary exits with a non-zero code', async () => {
		mockedSpawn.mockReturnValue( makeChildProcess( 1 ) as unknown as ReturnType< typeof spawn > );

		await expect(
			updateDomains( '/usr/local/bin/updater', [ 'example.lndo.site' ] )
		).rejects.toThrow( 'Binary exited with code 1' );
	} );

	it( 'rejects when the child process emits an error', async () => {
		const error = new Error( 'ENOENT: no such file or directory' );
		mockedSpawn.mockReturnValue(
			makeChildProcess( null, error ) as unknown as ReturnType< typeof spawn >
		);

		await expect(
			updateDomains( '/usr/local/bin/updater', [ 'example.lndo.site' ] )
		).rejects.toThrow( 'ENOENT: no such file or directory' );
	} );
} );
