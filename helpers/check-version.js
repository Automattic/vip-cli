const semver = require( 'semver' );

const { name, engines } = require( '../package.json' );

const version = engines.node;

if ( ! semver.satisfies( process.version, version ) ) {
	console.log(
		[
			`The current version of Node (${ process.version }) does not meet the minimum requirements;`,
			`${ name } requires Node version ${ version }.`,
			'Please follow the installation instructions at https://nodejs.org/en/download/ to upgrade before continuing.`',
		].join( ' ' )
	);
	process.exit( 1 );
}
