#!/usr/bin/env node

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import command from '../lib/cli/command';

command( {
	requiredArgs: 1,
	usage: 'vip @mysite.develop config software <action>',
} )
	.command( 'get', 'Read current software settings' )
	.command( 'update', 'Update software settings' )
	.argv( process.argv );
