#!/usr/bin/env node

const commander = require( 'commander' );

// ours
const API = require( '../lib/api' );
const format = require( '../lib/cli/format' );

commander
	.command( 'list' )
	.option( '--format <format>', 'table, csv, ids, Default: table', 'table' )
	.action( async options => {
		const api = await API();
		let apps = await api
			.query({ query: '{apps(limit:10,page:1){id,name,environments{id}}}' })
			.catch( err => {
				err.forEach( err => {
					console.log( 'Error:', err.message );
				});
			});

		if ( apps ) {
			apps = apps.data.apps.map( app => {
				app.environments = app.environments.length;
				return app;
			});

			return console.log( format( apps, options.format ) );
		}
	});

commander.parse( process.argv );

const cmds = commander.commands.map( c => c._name );
const subCmd = commander.args.length > 0 ? commander.args.pop()._name : process.argv.pop();
if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf( subCmd ) ) {
	commander.help();
}
