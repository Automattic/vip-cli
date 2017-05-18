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
	.command( 'upgrade' )
	.description( 'Update/Rebuild a site\'s web containers based on DC allocation records or default config' )
	.option( '-c, --client <client_id>', 'Client to target' )
	.option( '-l, --launched', 'Target launched sites only?' )
	.option( '-s, --search <search>', 'Search for sites to upgrade' )
	.option( '-n, --pagesize <pagesize>', 'Number of sites to update per batch', 5, parseInt )
	.option( '-e, --environment <env>', 'Environment to target' )
	.option( '-w, --wp <version>', 'WordPress version to target' )
	.action( ( options ) => {
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

		utils.displayNotice( [
			'Triggering web server update/rebuild:',
			query,
		] );

		siteUtils.update( null, query )
			.then( data => {
				let failed = data.failed.map( d => d.name || d.domain_name );
				console.log( 'Warning: Failed to queue upgrades for ', failed.join( ', ' ) );

				// Continue with sites that were successfully queued
				return data.sites;
			})
			.then( sites => {
				if ( sites.length <= 0 ) {
					return console.log( "No sites to update" );
				}

				api
					.get( '/container_types/1' )
					.end( ( err, res ) => {
						if ( err ) {
							return console.error( 'Could not retrieve default software stack' );
						}

						var defaultStack = res.body.data[0].software_stack_name;

						var updatingInterval = setInterval( () => {
							let upgrading = sites.map( site => {
								return siteUtils.getContainers( site )
								.then( containers => containers.filter( container => container.container_type_id === 1 ) );
							});

							Promise.all( upgrading )
							.then( sites => {
								var table = new Table({
									head: [ 'Site', 'Container ID', 'Container Status', 'Software Stack' ],
									style: {
										head: ['blue'],
									},
								});

								sites.forEach( site => {
									site.forEach( container => {
										var colorized_state = container.state;

										switch ( colorized_state ) {
										case 'running':
											if ( container.software_stack_name === defaultStack ) {
												colorized_state = colors['green']( colorized_state );
											} else {
												colorized_state = colors['yellow']( colorized_state );
											}
											break;
										case 'upgrading':
											colorized_state = colors['blue']( colorized_state );
											break;
										case 'stopped':
										case 'uninitialized':
											colorized_state = colors['red']( colorized_state );
										}

										table.push( [
											container.domain_name,
											container.container_id,
											colorized_state,
											container.software_stack_name,
										] );
									});
								});

								let done = sites.every( site => {
									return site.every( container => {
										return container.software_stack_name === defaultStack && container.state === 'running';
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

program
	.command( 'update <site>' )
	.description( 'Update/Rebuild a site\'s web containers based on DC allocation records or default config' )
	.action( site => {
		utils.findSite( site, ( err, site ) => {
			if ( err ) {
				return console.error( err );
			}

			if ( ! site ) {
				return console.error( 'Specified site does not exist. Try the ID.' );
			}

			let updateCheckInterval;

			const checkStatus = ( actionId ) => {
				siteUtils.getContainers( site )
					.then( containers => {
						return containers.filter( container => container.container_type_id === 1 ); // WEB = 1
					})
					.then( webContainers => {
						const hostId = webContainers[0].host_id;
						hostUtils.getHostAction( hostId, actionId )
							.then( action => {
								const output = [];
								output.push( `## Container Status (updated ${ new Date().toISOString() }):` );

								webContainers.forEach( container => output.push( `#${ container.container_id } - ${ container.container_name } - ${ container.state }` ) );

								output.push( '' );
								output.push( '## wp-cli (`core update-db`) Status:' );

								if ( action ) {
									output.push( `Action #${ action.host_action_id }: ${ action.status } on host #${ hostId }` );
								} else {
									output.push( `Action #${ actionId }: completed on host #${ hostId }` );
								}
								output.push( '' );

								log( output.join( '\n' ) );

								if ( ! action ) {
									clearInterval( updateCheckInterval );
									console.log( '' );
									console.log( 'Update complete 🎉🎉🎉' );
								}
							})
							.catch( err => console.log( 'Failed to get host action: ' + err.message ) );
					})
					.catch( err => console.log( 'Failed to check status: ' + err.message ) );
			};

			utils.displayNotice( [
				'Triggering web server update/rebuild:',
				`-- Site: ${ site.domain_name } (#${ site.client_site_id })`,
				'-- Environment: ' + site.environment_name,
			] );

			siteUtils.update( site )
				.then( data => {
					console.log( '' );
					console.log( `${ data.data } (action #${ data.result })` );
					console.log( '' );

					return data.result;
				})
				.then( actionId => {
					updateCheckInterval = setInterval( () => checkStatus( actionId ), 2000 );
				})
				.catch( err => console.error( err.message ) );
		});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
