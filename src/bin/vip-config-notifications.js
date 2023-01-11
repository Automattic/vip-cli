#!/usr/bin/env node

/**
 * Internal dependencies
 */
import command from 'lib/cli/command';

command( {
	requiredArgs: 1,
	usage: 'vip @mysite.develop config notification-streams <action>',
} )
	.command( 'list', 'List current notification streams' )
	.command( 'get', 'Read a specific notification stream' )
	.command( 'add', 'Add a new notification stream' )
	.command( 'update', 'Update an existing notification stream' )
	.argv( process.argv );
