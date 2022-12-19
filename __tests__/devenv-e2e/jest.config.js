const path = require( 'path' );

/** @type {import('jest').Config} */
const config = {
	verbose: true,
	slowTestThreshold: 30,
	testRegex: [
		'\\.(test|spec)\\.js$',
	],
	rootDir: path.join( __dirname, '..', '..' ),
	roots: [
		'<rootDir>/__tests__/devenv-e2e',
	],
	reporters: [ 'default', 'github-actions' ],
	testTimeout: 600000,
	maxWorkers: 1, // We cannot have more because of the way Lando works
};

module.exports = config;
