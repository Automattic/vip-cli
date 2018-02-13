#!/usr/bin/env node
// @flow

// ours
const command = require( '../lib/cli/command' );
const API = require( '../lib/api' );

command( { format: true } )
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

			return apps;
		}
	} );
