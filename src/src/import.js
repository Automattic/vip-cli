const fs = require( 'fs' );
const http = require( 'http' );

export function upload( site, file, token, cb ) {
	fs.readFile( file, ( err, data ) => {
		var filepath = file.split( 'uploads' );
		var req = http.request({
			hostname: 'files.vipv2.net',
			method:   'PUT',
			path:     '/wp-content/uploads' + filepath[1],
			headers:  {
				'X-Client-Site-ID': site.client_site_id,
				'X-Access-Token': token,
			}
		}, cb );

		req.on( 'socket', function ( socket ) {
			socket.setTimeout( 10000 );
			socket.on( 'timeout', function() {
				req.abort();
			});
		});

		req.write( data );
		req.end();
	});
}

export function queueDir( dir, offset, cb ) {
	var priority = 0 - dir.split( '/' ).length;

	fs.readdir( dir, ( err, files ) => {
		if ( files.length - offset < 10000 ) {
			// If there are less than 2 full rounds of files left, just do them all now
			files = files.slice( offset, offset + 10000 );
			files = files.map(f => dir + '/' + f);

			return cb([{
				item: files,
				priority: priority
			}]);
		}

		// Queue next 5k files
		files = files.slice( offset, offset + 5000 );
		offset += 5000;

		// Queue files with absolute path
		files = files.map(f => dir + '/' + f);

		var ptr = 'ptr:' + offset + ':' + dir;
		return cb([
			{
				priority: priority,
				item: files
			},
			{
				// Process the pointer after this batch of files
				priority: priority + 1,
				item: ptr
			}
		]);
	});
}
