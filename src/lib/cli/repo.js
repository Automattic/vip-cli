/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import ini from 'ini';

export default async function getRepoFromGitConfig() {
	const file = await find();

	if ( ! file.length ) {
		return '';
	}

	const config = ini.parse( fs.readFileSync( file, 'utf-8' ) );

	// Find the first 'wpcomvip' remote
	for ( const key in config ) {
		if ( 'remote' !== key.substring( 0, 6 ) ) {
			continue;
		}

		if ( ! config[ key ].url ) {
			continue;
		}

		if ( 0 > config[ key ].url.indexOf( 'wpcomvip/' ) ) {
			continue;
		}

		let repo = config[ key ].url;
		repo = repo.replace( /.git$/, '' );
		repo = repo.replace( 'https://github.com/', '' );
		repo = repo.replace( 'git@github.com:', '' );

		return repo;
	}

	return;
}

async function find( dir ) {
	dir = dir || process.cwd();

	const test = dir + '/.git/config';
	if ( await exists( test ) ) {
		return test;
	}

	// Bail if we went all the way and didn't find it
	const directory = path.parse( dir );
	if ( directory.dir === directory.root ) {
		return '';
	}

	// cd ..
	const up = dir.split( path.sep );
	up.pop();

	return find( up.join( path.sep ) );
}

async function exists( file ) {
	return new Promise( resolve => {
		fs.access( file, fs.constants.F_OK, err => resolve( ! err ) );
	} );
}
