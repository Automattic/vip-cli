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
	requiredArgs: 3,
} )
	.argv( process.argv, async ( arg, opts ) => {
		const stdoutStream = IOStream.createStream();

		IOStream( socket ).emit( 'readStdout', stdoutStream );

		stdoutStream.pipe( process.stdout );
	} );
