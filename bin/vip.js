#!/usr/bin/env node

const commander = require( 'commander' );

// ours
const pkg = require( '../package.json' );

commander
	.version( pkg.version );

commander.parse( process.argv );
