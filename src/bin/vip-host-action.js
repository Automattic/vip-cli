const program = require( 'commander' );
const log = require( 'single-line-log' ).stdout;
const Table = require( 'cli-table' );

// Ours
const api = require( '../lib/api' );
const host = require( '../lib/host' );

program
	.command( 'create <action>' )
	.option( '-h, --host <host>', 'Host ID' )
	.option( '-p, --payload <payload>', 'Payload', JSON.parse, {})
	.action( ( action, options ) => {
		if ( ! options.host ) {
			// TODO: Automatically infer the host ID from container_id when there is one?
			console.error( 'ERROR: Missing host ID' );
			return;
		}

		// TODO: Add option to watch this action until it's completed
		host.createHostAction( options.host, action, options.payload )
			.then( res => {
				console.log( res );
			})
			.catch( err => console.error( err ) );
	});

program
	.command( 'requeue <host> <host-action-id>' )
	.action( ( host, action ) => {
		api
			.post( '/hosts/' + host + '/actions/' + action + '/requeue' )
			.end( ( err, res ) => {
				// TODO: Add option to watch this action until it's completed
				if ( err ) {
					return console.error( err.response.error );
				}

				console.log( res.body );
			});
	});

program
	.command( 'list' )
	.option( '-h, --host <host>', 'Host to filter' )
	.option( '-s, --status <status>', 'Status to filter', 'any' )
	.option( '-w, --watch', 'Poll the options table for updates every 1s' )
	.action( ( options ) => {
		let opts = {};

		if ( options.host ) {
			opts.host_id = options.host;
		}

		if ( options.status ) {
			opts.status = options.status;
		}

		if ( options.watch ) {
			setInterval( () => {
				getHostActionsTable( opts );
			}, 1000 );
		} else {
			getHostActionsTable( opts );
		}

	});

function getHostActionsTable( opts ) {
	let table = new Table({
		head: [ 'ID', 'Host ID', 'Action Type', 'Status' ],
		style: {
			head: ['blue'],
		},
	});

	host.getHostActions( opts )
		.then( actions => {
			actions.forEach( action => {
				table.push( [
					action.host_action_id,
					action.host_id,
					action.action_type,
					action.status,
				] );
			});

			log( table.toString() + '\n' );
		})
		.catch( err => console.error( err ) );
}

program.parse( process.argv );
if ( ! process.argv.slice( 2 ).length ) {
	program.help();
}
