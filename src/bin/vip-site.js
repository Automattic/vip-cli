const program = require( 'commander' );
const log = require( 'single-line-log' ).stdout;
const Table = require( 'cli-table' );

// Ours
const api         = require( '../lib/api' );
const utils       = require( '../lib/utils' );
const siteUtils   = require( '../lib/site' );
const hostUtils   = require( '../lib/host' );

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
