const fs = require( 'fs' );
const http = require( 'http' );

module.exports = {
	upload: function( site, file, token, cb ) {
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
};
