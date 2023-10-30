#!/usr/bin/env node

/**
 * External dependencies
 */
import debugLib from 'debug';
import chalk from 'chalk';

/**
 * Internal dependencies
 */
import { trackEvent } from '../lib/tracker';
import command from '../lib/cli/command';
import { destroyEnvironment, getAllEnvironmentNames } from '../lib/dev-environment/dev-environment-core';
import { DEV_ENVIRONMENT_FULL_COMMAND } from '../lib/constants/dev-environment';
import {
	getEnvTrackingInfo,
	handleCLIException,
	validateDependencies,
} from '../lib/dev-environment/dev-environment-cli';
import { bootstrapLando } from '../lib/dev-environment/dev-environment-lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const examples = [
	{
		usage: `${ DEV_ENVIRONMENT_FULL_COMMAND } purge`,
		description: 'Destroys all local dev environments',
	},
];

command()
	.option( 'soft', 'Keep config files needed to start an environment intact' )
	.examples( examples )
	.argv( process.argv, async ( arg, opt ) => {
		const allEnvNames = getAllEnvironmentNames();
        const trackingInfo = { all: true };
        await trackEvent( 'dev_env_purge_command_execute', trackingInfo );

        try {
            for ( const envName of allEnvNames ) {
                const slug = envName;
                const lando = await bootstrapLando();
                await validateDependencies( lando, slug );
    
                const trackingInfo = getEnvTrackingInfo( slug );
                await trackEvent( 'dev_env_destroy_command_execute', trackingInfo );
    
                debug( 'Args: ', arg, 'Options: ', opt );
    
                try {
                    const removeFiles = ! ( opt.soft || false );
                    await destroyEnvironment( lando, slug, removeFiles );
    
                    const message = chalk.green( '✓' ) + ' Environment destroyed.\n';
                    console.log( message );
                    await trackEvent( 'dev_env_destroy_command_success', trackingInfo );
                } catch ( error ) {
                    await handleCLIException( error, 'dev_env_destroy_command_error', trackingInfo );
                    process.exitCode = 1;
                }
            }
        } catch ( error ) {
            await handleCLIException( error, 'dev_env_purge_command_error', trackingInfo );
            process.exitCode = 1;
        }
        
	} );