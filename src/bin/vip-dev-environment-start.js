#!/usr/bin/env node

/**
 * @flow
 * @fomat
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';


const debug = debugLib( '@automattic/vip:bin:vip-dev-environment' );

// Command examples
const examples = [
	{
		usage: 'vip dev-environment start',
		description: 'Starts local dev environment\n' +
		'       * If the environment isn\'t built yet it will build it as well',
	},
];

command()
	.option( 'name', 'Custom name of the dev environment' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const { name } = opt;

		debug( 'Args: ', arg, 'Options: ', opt );
	} );
