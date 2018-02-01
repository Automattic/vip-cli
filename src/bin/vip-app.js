#!/usr/bin/env node

// ours
const args = require( '../lib/cli/command' );
const API = require( '../lib/api' );

args( { wildcardCommand: true, format: true } )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv, async ( arg, opts ) => {
		const api = await API();
		const res = await api
			.query( {
				query: `{app(id:${ arg[ 0 ] }){
					id,name,environments{id,name,defaultDomain,branch,datacenter}
				}}`
			} )
			.catch( err => console.log( err ) );

		if ( res ) {
			return res.data.app.environments;
		}
	} );
