/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import * as exit from './exit';
import * as featureFlags from 'lib/api/feature-flags';
import Token from 'lib/token';

export async function checkFeatureEnabled(
	featureName,
	exitOnFalse = false
) {
	// TODO: eventually let's look at more feature flags coming from the public api,
	// for now, let's see if the user of the CLI is VIP
	await trackEvent( 'checkFeatureEnabled_start', { featureName, exitOnFalse } );

	const isVIP = await new Promise( async resolve => {
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

// Because this function is called by trackEvent:
// - It cannot directly or indirectly call trackEvent, or it will cause a loop.
// - It is mocked globally in jest.setupMocks.js.
export async function checkIfUserIsVip() {
	const token = await Token.get();

	if ( token && token.valid() ) {
		const res = await featureFlags.get();

		return !! res?.data?.me?.isVIP;
	}

	return false;
}

export async function exitWhenFeatureDisabled( featureName ) {
	return checkFeatureEnabled( featureName, true );
}
