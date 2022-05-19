/**
 * Internal dependencies
 */
import env from './env';
import config from 'lib/cli/config';

const Rollbar = require( 'rollbar' );
export const rollbar = new Rollbar( {
	accessToken: '99c8f982d64f47049fde6f6f9d567070',
	captureUncaught: true,
	captureUnhandledRejections: true,
	/* eslint-disable camelcase */
	payload: {
		platform: 'client',
		cli_version: env.app.version,
		os_name: env.os.name,
		node_version: env.node.version,
		environment: config.environment,
	},
	/* eslint-enable camelcase */
} );

