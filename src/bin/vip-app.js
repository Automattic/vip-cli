#!/usr/bin/env node

// ours
const args = require( '../lib/cli/command' );
const API = require( '../lib/api' );

args( { wildcardCommand: true, format: true } )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		const app = arg[ 0 ];
		const api = await API();

		if ( isNaN( parseInt( app ) ) ) {
			const res = await api
				.query( {
					query: `{apps(name:"${ app }"){
						id,name,environments{id,name,defaultDomain,branch,datacenter}
					}}`
				} )
				.catch( err => { /* noop */ } );

			if ( ! res || ! res.data || ! res.data.apps || ! res.data.apps.length ) {
				return console.log( `App ${ app.blue } does not exist` );
			}

			return res.data.apps[ 0 ].environments;
		} else {
			const res = await api
				.query( {
					query: `{app(id:${ app }){
						id,name,environments{id,name,defaultDomain,branch,datacenter}
					}}`
				} )
				.catch( err => { /* noop */ } );

			if ( ! res || ! res.data || ! res.data.app ) {
				return console.log( `App ${ app.toString().blue } does not exist` );
			}

			return res.data.app.environments;
		}
	} );
