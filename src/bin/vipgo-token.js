const program = require( 'commander' );
const Table = require( 'cli-table' );

// Ours
const api         = require( '../lib/api' );

program
	.command( 'list' )
	.description( 'List tokens' )
	.action( () => {
		api.get( '/tokens' )
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				var table = new Table({
					head: [
						'ID',
						'Name',
						'Expires',
						'Last Used',
						'Active',
					],
					style: {
						head: ['blue'],
					},
				});

				res.body.data.forEach( t => {
					table.push( [
						t.api_user_token_id,
						t.name || 'N/A',
						t.token_expire_time,
						t.last_user_time,
						t.active,
					] );
				});

				console.log( table.toString() );
				console.log( res.body.result + ' of ' + res.body.totalrecs + ' results.' );
			});
	});

program
	.command( 'create' )
	.description( 'Create an API token' )
	.option( '-u, --user <id>', 'User to create token for' )
	.option( '-e, --expires <time>', 'Token expire time' )
	.action( options => {
		let query = {};

		if ( options.user ) {
			query.api_user_id = options.user;
		}

		if ( options.expires ) {
			query.token_expire_time = options.expires;
		}

		api.post( '/tokens' )
			.send( query )
			.end( ( err, res ) => {
				if ( err ) {
					return console.error( err.response.error );
				}

				console.log( res.body );
			});
	});

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
