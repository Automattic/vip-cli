#!/usr/bin/env node

// ours
const args = require( '../lib/cli/command' );
const API = require( '../lib/api' );
const format = require( '../lib/cli/format' );

args( { emptyCommand: true, format: true } )
	.argv( process.argv, async ( arg, options ) => {
		const api = await API();
		let apps = await api
			.query( { query: '{apps(limit:10,page:1){id,name,repo,environments{id}}}' } )
			.catch( err => console.log( err ) );

		if ( apps ) {
			apps = apps.data.apps.map( app => {
				app.environments = app.environments.length;
				return app;
			} );

			return console.log( format( apps, options.format ) );
		}
	} );
