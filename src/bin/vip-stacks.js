const program = require( 'commander' );
const log = require( 'single-line-log' ).stdout;

// Ours
const api = require( '../lib/api' );

program
	.command( 'update' )
	.description( 'Update software stacks on the current sandbox' )
	.action( () => {
		api
			.get( '/hosts' )
			.query({
				search: require( 'os' ).hostname(),
				host_type_id: 5,
			})
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				var host_id = res.body.data[0].host_id;

				api
					.post( '/hosts/' + host_id + '/software_update' )
					.end( ( err, res ) => {
						if ( err ) {
							return console.error( err.response.error );
						}

						var poll = setInterval( () => {
							api
								.get( '/hosts/' + host_id + '/actions/' + res.body.result )
								.end( ( err, res ) => {
									if ( err ) {
										clearInterval( poll );

										if ( 404 != err.status ) {
											console.error( err.response.error );
										}

										return;
									}

									log( 'Software Stack update: ' + res.body.data[0].status + '\n' );
								});
						}, 1000 );
					});
			});
	});

program
	.command( 'deploy' )
	.description( 'Deploy software stacks across all hosts' )
	.action( () => {
		api
			.post( '/actions/software_update' )
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( '❌ Failed to deploy software stacks; ', err );
				}

				if ( res.body.status !== 'success' ) {
					return console.error( '❌ Failed to deploy software stacks; ', res.body );
				}

				console.log( `✅ Successfully created host action (#${ res.body.result }); software stacks will be deployed across all hosts shortly.` );
			});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
