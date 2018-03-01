// @flow

/**
 * External dependencies
 */
import fs from 'fs';
import path from 'path';
import ini from 'ini';

export default async function getRepoFromGitConfig(): Promise<string> {
	const file = await find();

	if ( ! file.length ) {
		return '';
	}

	const config = ini.parse( fs.readFileSync( file, 'utf-8' ) );

	let url = config[ 'remote "origin"' ].url;
	url = url.replace( /.git$/, '' );
	url = url.replace( 'https://github.com/', '' );
	url = url.replace( 'git@github.com:', '' );

	return url;
}

async function find( dir ): Promise<string> {
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

async function exists( file ): Promise<boolean> {
	return new Promise( resolve => {
		fs.access( file, fs.constants.F_OK, err => resolve( ! err ) );
	} );
}
