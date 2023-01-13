const path = require( 'node:path' );

/** @type {import('jest').Config} */
const config = {
	verbose: true,
	slowTestThreshold: 30,
	testRegex: [
		'\\.(test|spec)\\.js$',
	],
	rootDir: path.join( __dirname, '..', '..', '..' ),
	roots: [
		'<rootDir>/__tests__/devenv-e2e',
	],
	reporters: [ 'default', 'github-actions' ],
	testTimeout: 120000,
	maxWorkers: process.env.CI ? 1 : 2,
	testSequencer: path.join( __dirname, 'sequencer.js' ),
};

module.exports = config;
