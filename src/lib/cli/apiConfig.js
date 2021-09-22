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
	featureName: string,
	exitOnFalse: boolean = false
): Promise<boolean> {
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

export async function checkIsVIP(): Promise<boolean> {
	await trackEvent( 'checkIsVIP_start' );

	let isVip = false;
	try {
		isVip = await checkIfUserIsVip();
	} catch ( err ) {
		const message = err.toString();
		await trackEvent( 'checkFeatureEnabled_fetch_error', { error: message } );
	}

	return !! isVip;
}

export async function checkIfUserIsVip() {
	const token = await Token.get();

	if ( token && token.valid() ) {
		const res = await featureFlags.get();

		return !! res?.data?.me?.isVIP;
	}

	return false;
}

export async function exitWhenFeatureDisabled( featureName: string ): Promise<boolean> {
	return checkFeatureEnabled( featureName, true );
}
