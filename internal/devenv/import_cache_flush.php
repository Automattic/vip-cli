<?php
// Invalidate every blog's persistent option cache before WordPress boots.
$cache = fsockopen( 'memcached', 11211, $error_code, $error_message, 5 );
if ( false === $cache ) {
	fwrite( STDERR, "Could not connect to the local object cache.\n" );
	exit( 1 );
}
stream_set_timeout( $cache, 5 );
$written = fwrite( $cache, "flush_all\r\n" );
$response = fgets( $cache );
fclose( $cache );
if ( 11 !== $written || 'OK' !== trim( (string) $response ) ) {
	fwrite( STDERR, "Could not invalidate the local object cache.\n" );
	exit( 1 );
}
