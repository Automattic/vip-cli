const os = require( 'os' );

/** @type {import('jest').Config} */
const config = {
	verbose: true,
	slowTestThreshold: 15,
	testRegex: [
		'\\.(test|spec)\\.js$',
	],
	testTimeout: 600000,
	maxWorkers: process.env.CI ? 1 : os.cpus().length - 1,
};

module.exports = config;
