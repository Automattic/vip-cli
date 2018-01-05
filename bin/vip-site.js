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
		const sites = await api
			.query({ query: '{apps{id,name,environments{id,name}}}' })
			.catch( err => {
				err.forEach( err => {
					console.log( 'Error:', err.message );
				});
			});

		if ( sites ) {
			let data = [];
			sites.data.apps.forEach( site => {
				site.environments.forEach( env => {
					data.push({
						'apps.id': site.id,
						'apps.name': site.name,
						'apps.environments.id': env.id,
						'apps.environments.name': env.name,
					});
				});
			});

			console.log( format( data, options.format ) );
		}
	});

commander.parse( process.argv );

const cmds = commander.commands.map( c => c._name );
const subCmd = commander.args.length > 0 ? commander.args.pop()._name : process.argv.pop();
if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf( subCmd ) ) {
	commander.help();
}
