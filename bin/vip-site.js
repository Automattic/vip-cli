#!/usr/bin/env node

const commander = require( 'commander' );

// ours
const API = require( '../lib/api' );
const format = require( '../lib/cli/format' );

const defaultCommand = async () => {
	const api = new API();
	let sites = await api.query( '{apps{id,name}}' );
	sites = await sites.json();

	console.log( format( sites.data.apps ) );
};

commander
	.command( 'list' )
	.action( defaultCommand );

commander.parse( process.argv );

const cmds = commander.commands.map( c => c._name );
const subCmd = commander.args.length > 0 ? commander.args.pop()._name : process.argv.pop();
if ( ! process.argv.slice( 2 ).length ) {
	defaultCommand();
} else if ( 0 > cmds.indexOf( subCmd ) ) {
	commander.help();
}
