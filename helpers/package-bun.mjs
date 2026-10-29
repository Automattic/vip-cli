import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { c as createTar } from 'tar';

const artifactName = process.argv[ 2 ];
const supported = new Set( [
	'vip-linux-amd64',
	'vip-linux-arm64',
	'vip-macos-amd64',
	'vip-macos-arm64',
	'vip-windows-amd64',
] );
if ( ! supported.has( artifactName ) ) {
	throw new Error( 'Pass a supported vip-<platform>-<architecture> artifact name.' );
}
const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const output = path.join( root, 'artifacts' );
const temporary = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-bun-package-' ) );
try {
	const windows = artifactName === 'vip-windows-amd64';
	const binaryName = windows ? 'vip.exe' : 'vip';
	const stagedBinary = path.join( temporary, binaryName );
	fs.copyFileSync( path.join( root, 'bin', binaryName ), stagedBinary );
	// Keep the staging copy owner-only; publish install permissions in the archive.
	fs.chmodSync( stagedBinary, 0o700 );
	fs.mkdirSync( output, { recursive: true } );
	const archiveName = `${ artifactName }.tar.gz`;
	const archive = path.join( output, archiveName );
	await createTar(
		{
			cwd: temporary,
			file: archive,
			gzip: true,
			portable: true,
			mtime: new Date( 0 ),
			onWriteEntry: entry => {
				// Public CLI installs need shared read/execute, never group/world write.
				// eslint-disable-next-line no-bitwise
				entry.stat.mode = ( entry.stat.mode & 0o170000 ) | 0o755;
			},
		},
		[ binaryName ]
	);
	const digest = createHash( 'sha256' ).update( fs.readFileSync( archive ) ).digest( 'hex' );
	fs.writeFileSync( `${ archive }.sha256`, `${ digest }  ${ archiveName }\n` );
	console.log( `Packaged ${ archiveName } and SHA256 checksum` );
} finally {
	fs.rmSync( temporary, { recursive: true, force: true } );
}
