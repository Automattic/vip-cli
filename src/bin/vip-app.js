#!/usr/bin/env node

// ours
const args = require( '../lib/cli/command' );
const API = require( '../lib/api' );
const format = require( '../lib/cli/format' );

const options = args( { empty: true, format: true } )
	.command( 'list', 'List your VIP Go apps' )
	.argv( process.argv );

const cmds = args().details.commands.map( cmd => cmd.usage );

if ( ! args().sub.length ) {
	args().showHelp();
} else if ( 0 > cmds.indexOf( args().sub[ 0 ] ) ) {
	const cmd = async function( arg, opts ) {
		const api = await API();
		const res = await api
			.query( {
				query: `{app(id:${ arg[ 0 ] }){
					id,name,environments{id,name,defaultDomain,branch,datacenter}
				}}`
			} )
			.catch( err => console.log( err ) );

		if ( res ) {
			return console.log( format( res.data.app.environments, opts.format ) );
		}
	};

	cmd( args().sub, options );
}
