/* eslint-disable no-await-in-loop */
/**
 * External dependencies
 */
import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/**
 * Reads a Certificate Authority file and returns it as an array of certificates
 *
 * @param {string} filepath Path to the file
 * @return {string[]} Array of certificates
 */
export async function splitca( filepath: string ): Promise< string[] > {
	const ca: string[] = [];
	const data = await readFile( filepath, 'utf-8' );
	if ( ! data.includes( '-END CERTIFICATE-' ) || ! data.includes( '-BEGIN CERTIFICATE-' ) ) {
		throw new Error( "File does not contain 'BEGIN CERTIFICATE' or 'END CERTIFICATE'" );
	}

	const chain = data.split( '\n' );
	let cert = [];
	for ( const line of chain ) {
		if ( line ) {
			cert.push( line );
			if ( /-END CERTIFICATE-/.exec( line ) ) {
				ca.push( cert.join( '\n' ) );
				cert = [];
			}
		}
	}

	return ca;
}

async function canReadWrite( what: string ): Promise< boolean > {
	try {
		// eslint-disable-next-line no-bitwise
		await access( what, constants.R_OK | constants.W_OK );
		return true;
	} catch ( err ) {
		return false;
	}
}

export async function getDockerSocket(): Promise< string | null > {
	if ( platform() !== 'win32' ) {
		const possibleSocket = process.env.DOCKER_HOST ?? '';
		// If `DOCKER_HOST` is set and not empty, and if it does not point to a unix socket, return - not much that we can do here.
		if ( possibleSocket && ! possibleSocket.startsWith( 'unix://' ) ) {
			return possibleSocket;
		}

		const paths: string[] = [];
		if ( possibleSocket ) {
			// This is a UNIX socket, strip the leading `unix://` prefix and make sure the path starts with a slash.
			// (there are cases when the path is prefixed with two or three slashes)
			paths.push( possibleSocket.replace( /^unix:\/+/, '/' ) );
		}

		// Try the default location
		paths.push( '/var/run/docker.sock' );
		// Try an alternative location
		paths.push( join( homedir(), '.docker', 'run', 'docker.sock' ) );

		for ( const socketPath of paths ) {
			try {
				const stats = await stat( socketPath );
				if ( stats.isSocket() && ( await canReadWrite( socketPath ) ) ) {
					process.env.DOCKER_HOST = `unix://${ socketPath }`;
					return socketPath;
				}
			} catch ( err ) {
				// Do nothing
			}
		}
	}

	return null;
}

export async function getEngineConfig( dockerHost: string ): Promise< Record< string, unknown > > {
	const opts: Record< string, unknown > = {};
	if ( dockerHost.startsWith( 'tcp://' ) ) {
		const split = /(?:tcp:\/\/)?(.*?):(\d+)/g.exec( dockerHost );
		if ( split && split.length === 3 ) {
			opts.host = split[ 1 ];
			opts.port = split[ 2 ];
		} else {
			throw new Error( 'Invalid DOCKER_HOST format' );
		}
	} else {
		opts.socketPath = dockerHost;
	}

	if ( process.env.DOCKER_TLS_VERIFY === '1' || opts.port === '2376' ) {
		opts.protocol = 'https';
	} else {
		opts.protocol = 'http';
	}

	const certPath = process.env.DOCKER_CERT_PATH;
	if ( certPath ) {
		const [ ca, cert, key ] = await Promise.all( [
			splitca( join( certPath, 'ca.pem' ) ),
			readFile( join( certPath, 'cert.pem' ), 'utf-8' ),
			readFile( join( certPath, 'key.pem' ), 'utf-8' ),
		] );

		opts.ca = ca;
		opts.cert = cert;
		opts.key = key;
	}

	if ( process.env.DOCKER_CLIENT_TIMEOUT ) {
		opts.timeout = parseInt( process.env.DOCKER_CLIENT_TIMEOUT, 10 );
	}

	return opts;
}
