// @flow
const fs = require( 'fs' );
const path = require( 'path' );
const ini = require( 'ini' );

// ours
const API = require( '../api' );

module.exports = async function(): Promise<any> {
	const sourceRepo = await getRepoFromGitConfig();

	if ( ! sourceRepo.length ) {
		return {};
	}

	const api = await API();
	const repo = await api
		.query( { query: `{repo(name:"${ sourceRepo }"){name,apps{id,name}}}` } )
		.catch( err => console.log( err ) );

	if ( ! repo || ! repo.data || ! repo.data.repo ) {
		return {};
	}

	return repo.data.repo;
};

async function getRepoFromGitConfig(): Promise<string> {
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
