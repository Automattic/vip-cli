const { copyFileSync, readFileSync } = require( 'node:fs' );
const path = require( 'node:path' );

const PACKAGE_LOCK = 'package-lock.json';
const NPM_SHRINKWRAP = 'npm-shrinkwrap.json';

function syncShrinkwrap( { cwd = process.cwd(), check = false } = {} ) {
	const packageLockPath = path.join( cwd, PACKAGE_LOCK );
	const shrinkwrapPath = path.join( cwd, NPM_SHRINKWRAP );

	if ( check ) {
		const packageLock = readFileSync( packageLockPath );
		const shrinkwrap = readFileSync( shrinkwrapPath );
		if ( ! packageLock.equals( shrinkwrap ) ) {
			throw new Error( `${ NPM_SHRINKWRAP } is out of sync with ${ PACKAGE_LOCK }` );
		}
		return;
	}

	copyFileSync( packageLockPath, shrinkwrapPath );
}

if ( require.main === module ) {
	try {
		syncShrinkwrap( { check: process.argv.includes( '--check' ) } );
	} catch ( error ) {
		console.error( error.message );
		process.exitCode = 1;
	}
}

module.exports = { syncShrinkwrap };
