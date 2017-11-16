const program = require( 'commander' );
const log = require( 'single-line-log' ).stderr;
const Table = require( 'cli-table' );
const colors = require( 'colors/safe' );

// Ours
const api         = require( '../lib/api' );
const utils       = require( '../lib/utils' );
const siteUtils   = require( '../lib/site' );
const hostUtils   = require( '../lib/host' );

program
	.command( 'upgrade [<site>]' )
	.description( 'Update/Rebuild a site\'s web containers based on DC allocation records or default config' )
	.option( '-c, --client <client_id>', 'Client to target' )
	.option( '-l, --launched', 'Target launched sites only?' )
	.option( '-s, --search <search>', 'Search for sites to upgrade' )
	.option( '-n, --pagesize <pagesize>', 'Number of sites to update per batch', 5, parseInt )
	.option( '-e, --environment <env>', 'Environment to target' )
	.option( '-w, --wp <version>', 'WordPress version to target' )
	.action( ( site, options ) => {
		// TODO: Optionally pass in a site ID for single site upgrade
		let query = {};

		if ( options.pagesize ) {
			query.pagesize = options.pagesize;
		}

		if ( options.environment ) {
			query.environment_name = options.environment;
		}

		if ( options.wp ) {
			query.wp = options.wp;
		}

		if ( options.client ) {
			query.client_id = options.client;
		}

		if ( options.launched ) {
			query.launched = 1;
		}

		if ( options.search ) {
			query.search = options.search;
		}

		// Note: This needs to come last so we appropriately nerf the query object
		if ( site ) {
			query = { client_site_id: site, pagesize: 1 };
		}

		utils.displayNotice( [
			'Triggering web server update/rebuild:',
			query,
		] );

		siteUtils.update( null, query )
			.then( data => {
				if ( ! data.failed ) {
					return data.sites;
				}

				let failed = data.failed.map( d => d.name || d.domain_name );

				if ( failed.length > 0 ) {
					console.log( 'Warning: Failed to queue upgrades for ', failed.join( ', ' ) );
				}

				// Continue with sites that were successfully queued
				return data.sites;
			})
			.then( sites => {
				if ( ! sites || sites.length <= 0 ) {
					return console.log( "No sites to update" );
				}

				// TODO: Add endpoint to get expected stacks for each site
				api
					.get( '/site_type_allocations/9' )
					.end( ( err, res ) => {
						if ( err ) {
							return console.error( 'Could not retrieve default software stack' );
						}

						var defaultStack = res.body.data[0].default_software_stack_id;

						var updatingInterval = setInterval( () => {
							let upgrading = sites.map( site => {
								return siteUtils.getContainers( site )
								.then( containers => containers.filter( container => container.container_type_id === 1 || container.container_type_id === 14 ) );
							});

							Promise.all( upgrading )
							.then( sites => {
								var table = new Table({
									head: [ 'Site', 'Pending', 'Upgrading', 'Running' ],
									style: {
										head: ['blue'],
									},
								});

								sites.forEach( site => {
									let pending = site.filter( container => container.software_stack_id !== defaultStack && container.state === 'running' ).length;
									let upgrading = site.filter( container => container.state === 'upgrading' ).length;
									let running = site.filter( container => container.software_stack_id === defaultStack && container.state === 'running' ).length;

									let colorizedSite;

									if ( running === site.length ) {
										// Upgrade is done
										colorizedSite = colors[ 'green' ]( site[0].domain_name );
									} else if ( pending === site.length ) {
										// Upgrade has not started
										colorizedSite = colors[ 'yellow' ]( site[0].domain_name );
									} else {
										// Upgrade is running
										colorizedSite = colors[ 'white' ]( site[0].domain_name );
									}

									table.push( [
										colorizedSite,
										pending,
										upgrading,
										running,
									] );
								});

								let done = sites.every( site => {
									return site.every( container => {
										if ( container.state === 'stopped' || container.state === 'uninitialized' ) {
											return true;
										}

										if ( container.state !== 'running' ) {
											return false;
										}

										return container.software_stack_id === defaultStack;
									});
								});

								let output = table.toString();
								log( output );

								// TODO: Also check DC allocations because we might not be upgrading to the default
								if ( done ) {
									clearInterval( updatingInterval );
									console.log();
									console.log( 'Update complete' );
								}
							})
							.catch( err => console.error( err.message ) );
						}, 2000 );
					});
			})
			.catch( err => console.error( err.message ) );
	});

program
	.command( 'search <query>' )
	.description( 'Search sites' )
	.action( query => {
		api.get( '/sites' )
			.query({ 'search': query, pagesize: 10 })
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				var table = new Table({
					head: [
						'ID',
						'Name',
						'Domain',
					],
					style: {
						head: ['blue'],
					},
				});

				res.body.data.forEach( s => {
					table.push( [
						s.client_site_id,
						s.name || s.domain_name,
						s.primary_domain.domain_name,
					] );
				});

				console.log( table.toString() );
				console.log( res.body.result + ' of ' + res.body.totalrecs + ' results.' );
			});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
