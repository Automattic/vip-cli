const fs = require( 'node:fs' );
const { createRequire, isBuiltin } = require( 'node:module' );
const path = require( 'node:path' );

// These packages are loaded from disk rather than compiled into the executable.
const runtimePackages = [ '@github/keytar', 'lando', 'ssh2' ];

function runtimePackagePaths( root, installed ) {
	const available = new Set( installed.map( filename => path.resolve( filename ) ) );
	const selected = new Set();

	function visit( name, from, optional = false ) {
		if ( isBuiltin( name ) ) return;
		const requireFrom = createRequire( path.join( from, 'package.json' ) );
		const directory = requireFrom.resolve
			.paths( name )
			?.map( base => path.join( base, name ) )
			.find( candidate => available.has( candidate ) );
		if ( ! directory ) {
			if ( optional ) return;
			throw new Error( `Missing runtime dependency ${ name } required by ${ from }` );
		}
		if ( selected.has( directory ) ) return;
		selected.add( directory );
		const metadata = JSON.parse(
			fs.readFileSync( path.join( directory, 'package.json' ), 'utf8' )
		);
		const dependencies = {
			...metadata.peerDependencies,
			...metadata.dependencies,
			...metadata.optionalDependencies,
		};
		for ( const dependency of Object.keys( dependencies ) ) {
			const optionalDependency = Object.hasOwn( metadata.optionalDependencies || {}, dependency );
			const optionalPeer =
				! Object.hasOwn( metadata.dependencies || {}, dependency ) &&
				metadata.peerDependenciesMeta?.[ dependency ]?.optional === true;
			visit( dependency, directory, optionalDependency || optionalPeer );
		}
	}

	for ( const name of runtimePackages ) visit( name, root );
	return [ ...selected ].sort( ( left, right ) => {
		if ( left < right ) return -1;
		if ( left > right ) return 1;
		return 0;
	} );
}

module.exports = { runtimePackagePaths };
