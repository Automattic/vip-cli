/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import * as exit from './exit';
import * as featureFlags from 'lib/api/feature-flags';

export async function checkFeatureEnabled(
	featureName: string,
	exitOnFalse: boolean = false
): Promise<boolean> {
	// TODO: eventually let's look at more feature flags coming from the public api,
	// for now, let's see if the user of the CLI is VIP
	await trackEvent( 'checkFeatureEnabled_start', { featureName, exitOnFalse } );

	const isVIP = await new Promise( async ( resolve, reject ) => {
		try {
			const res = await featureFlags.get();
			if ( res?.data?.me?.isVIP !== undefined ) {
				resolve( res.data.me.isVIP );
			} else {
				resolve( false );
			}
		} catch ( err ) {
			const message = err.toString();
			await trackEvent( 'checkFeatureEnabled_fetch_error', {
				featureName,
				exitOnFalse,
				error: message,
			} );

			exit.withError( 'Failed to determine if feature is enabled' + message );
		}
	} );

	if ( exitOnFalse === true && isVIP === false ) {
		exit.withError( 'The feature you are attempting to use is not currently enabled.' );
	}

	return isVIP === true;
}

export async function exitWhenFeatureDisabled( featureName: string ): Promise<boolean> {
	return checkFeatureEnabled( featureName, true );
}
