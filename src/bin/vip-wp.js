#!/usr/bin/env node
// @flow

/**
 * External dependencies
 */
import chalk from 'chalk';
import gql from 'graphql-tag';
import { stdout } from 'single-line-log';
import SocketIO from 'socket.io-client';
import IOStream from 'socket.io-stream';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import app from 'lib/api/app';
import command from 'lib/cli/command';
import { formatEnvironment } from 'lib/cli/format';
import { trackEvent } from 'lib/tracker';

const socket = SocketIO( 'http://localhost:4000/wp-cli' );

command( {
	requiredArgs: 2,
} )
	.argv( process.argv, async ( arg, opts ) => {
		const stdoutStream = IOStream.createStream();
		const stdinStream = IOStream.createStream();

		// TODO handle all arguments
		// TODO trigger mutation
		// TODO subscribe to stream
		// TODO handle disconnect - does IOStream correctly buffer stdin?
		// TODO stderr - currently server doesn't support it, so errors don't terminate process

		const cmd = arg.join( ' ' );

		const data = {
			cmd,
			guid: 'some-generated-guid-from-mutation',
			columns: process.stdout.columns,
			rows: process.stdout.rows,
		};

		IOStream( socket ).emit( 'cmd', data, stdinStream, stdoutStream );

		stdoutStream.pipe( process.stdout );

		stdoutStream.on( 'error', err => {
			// TODO handle this better
			console.log( err );

			process.exit( 1 );
		} );

		stdoutStream.on( 'end', () => {
			process.exit();
		} );
	} );
