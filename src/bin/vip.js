#!/usr/bin/env node

/**
 * The command line vip tool
 */

process.title = 'vip';

const program = require( 'commander' );
const tab = require( 'tabtab' )({ name: 'vip' });
const updateNotifier = require( 'update-notifier' );

// Ours
const pkg = require( '../../package.json' );
const utils = require( '../lib/utils' );
const api = require( '../lib/api' );

// Do update notifications
updateNotifier({ pkg }).notify();

const hostname = require( 'os' ).hostname();
const isSandbox = hostname.substring( hostname.length - 9 ) === 'vipv2.net';
const noAuth = [
	'login',
	'logout',
];

utils.getCredentials( ( err, user ) => {
	if ( err || ! user ) {
		if ( process.argv.length > 2 ) {
			if ( ! noAuth.indexOf( process.argv[2] ) ) {
				return program.executeSubCommand( process.argv.concat( 'login' ), [ 'login' ] );
			}
		}
	}

	program
		.version( pkg.version )
		.command( 'login', 'Setup an access token to use with the CLI' );

	program
		.command( 'logout' )
		.description( 'Delete the stored access token' )
		.action( () => {
			utils.deleteCredentials();
		});

	program
		.command( 'api <method> <endpoint>', 'Authenticated API requests' );

	if ( api.currentUserCanRead( 'sites/masterdb' ) ) {
		program
			.command( 'db <site>', 'Connect to a given VIP Go database' );
	}

	if ( api.currentUserCanAdd( 'sites/revisions/deploy' ) ) {
		program
			.command( 'deploy <site> <sha>', 'Deploy given git sha' );
	}

	if ( api.currentUserCanRead( 'sites/files' ) ) {
		program
			.command( 'files <site>', 'Export files for a site' );
	}

	if ( api.currentUserCanRead( 'hosts/actions' ) ) {
		program
			.command( 'host-action', 'Create and view host actions' );
	}

	if ( api.currentUserCanRead( 'sites/masterdb' ) ) {
		program
			.command( 'import', 'Import to VIP Go' );
	}

	if ( isSandbox && api.currentUserCanRead( 'sandboxes' ) ) {
		program
			.command( 'sandbox <action> <site>', 'Maintain sandbox containers' );
	}

	if ( api.currentUserCanAdd( 'hosts/software_update' ) || api.currentUserCanAdd( 'actions/software_update' ) ) {
		program
			.command( 'stacks <action>', 'Maintain software stacks on the current host' );
	}

	if ( api.currentUserCanRead( 'sites' ) ) {
		program
			.command( 'site <action>', 'Perform actions on a site' );
	}

	if ( api.currentUserCanRead( 'tokens' ) ) {
		program
			.command( 'token <action>', 'Perform actions on API tokens' );
	}

	tab.on( 'deploy', ( data, done ) => {
		api
			.get( '/search' )
			.query( 'search', data.lastPartial )
			.end( ( end, res ) => {
				if ( err ) {
					return done( err );
				}

				var mapped, sites = [];

				// Add initial domain to suggestions list
				sites = res.body.data.map( s => {
					return s.domain_name;
				});

				// Add mapped domains to suggestions list
				for( let i = 0; i < res.body.data.length; i++ ) {
					mapped = res.body.data[i].mapped_domains.map( d => {
						return d.domain_name;
					});

					sites = sites.concat( mapped );
				}

				return done( null, sites );
			});
	});

	// Tab complete top level commands!
	tab.on( 'vip', ( data, done ) => {
		var commands = program.commands.map( c => {
			if ( data.prev === c.parent.name() ) {
				return c.name();
			}
		});

		return done( null, commands );
	});

	tab.start();

	program.parse( process.argv );
	var cmds = program.commands.map( c => c._name );
	var subCmd = program.args.pop()._name || process.argv[2];

	if ( ! process.argv.slice( 2 ).length || 0 > cmds.indexOf( subCmd ) ) {
		program.help();
	}
});
