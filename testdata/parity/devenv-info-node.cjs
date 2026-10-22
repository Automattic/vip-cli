// Supply Docker/Lando boundaries while exercising the real Node info code and
// Lando URL derivation. Shared by Jest and the Node-vs-Go differential.
const dns = require( 'node:dns/promises' );
const path = require( 'node:path' );
const { getUrls } = require( 'lando/plugins/lando-core/lib/utils' );
const { parse2Info } = require( 'lando/plugins/lando-proxy/lib/utils' );

module.exports = async function info( landoInfo, instancePath, states, ports ) {
	const scans = {};
	const routes = {
		nginx: [ 'demo.vipdev.site' ],
		phpmyadmin: [ 'demo-pma.vipdev.site' ],
		mailpit: [ 'demo-mailpit.vipdev.site:8025' ],
	};
	const appInfo = states.map( state => {
		const exposed = {};
		const bindings = {};
		for ( const p of state.Publishers ?? [] ) {
			const key = `${ p.TargetPort }/${ p.Protocol }`;
			exposed[ key ] = {};
			bindings[ key ] ??= [];
			if ( p.PublishedPort && state.State === 'running' ) {
				bindings[ key ].push( { HostIp: p.URL, HostPort: String( p.PublishedPort ) } );
			}
		}
		const scan = {
			Config: { ExposedPorts: exposed, Labels: { 'com.docker.compose.service': state.Service } },
			NetworkSettings: { Ports: bindings },
		};
		scans[ state.Service ] = scan;
		const info = getUrls( scan, [ '80', '443' ] );
		info.urls.push( ...parse2Info( routes[ state.Service ] ?? [], ports, true ) );
		return info;
	} );
	const app = {
		name: 'demo', root: instancePath, project: 'demo', info: appInfo,
		events: { on() {} }, init: async () => {},
		urls: [], scanUrls: async urls => urls.map( url => ( { url, status: true, color: 'green' } ) ),
	};
	const lando = {
		getApp: () => app,
		engine: {
			list: async () => states.map( s => ( { service: s.Service, id: s.Service } ) ),
			docker: {
				scan: async id => scans[ id ],
				listContainers: async () => states.map( s => ( { State: s.State, Labels: { 'com.docker.compose.service': s.Service } } ) ),
			},
		},
	};
	const lookup = dns.lookup;
	dns.lookup = async () => ( { address: '127.0.0.1', family: 4 } );
	try {
		return await landoInfo( lando, instancePath, { suppressWarnings: true } );
	} finally {
		dns.lookup = lookup;
	}
};

if ( require.main === module ) {
	const { landoInfo } = require( path.resolve( process.argv[ 2 ] ) );
	const states = require( path.resolve( process.argv[ 4 ] ) );
	module.exports( landoInfo, process.argv[ 3 ], states, { http: '8000', https: '444' } )
		.then( result => process.stdout.write( JSON.stringify( result ) ) )
		.catch( error => { console.error( error ); process.exitCode = 1; } );
}
