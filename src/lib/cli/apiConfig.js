/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';
import API from 'lib/api';
import * as exit from './exit';

export async function checkFeatureEnabled( featureName: string, exitOnFalse: boolean = false ): Promise<boolean> {
	// TODO: eventually let's look at more feature flags coming from the public api,
	// for now, let's see if the user of the CLI is VIP
	await trackEvent( 'checkFeatureEnabled_start', { featureName } );

	const api = await API();
	const isVIP = await new Promise( async resolve => {
		try {
			const res = await api.query( {
				// $FlowFixMe: gql template is not supported by flow
				query: gql`
                    query isVIP {
                        me {
                            isVIP
                        }
                    }
                `,
			} );
			resolve( res.data.me.isVIP );
		} catch ( err ) {
			const message = err.toString();
			await trackEvent( 'checkFeatureEnabled_fetch_error', {
				featureName,
				error: message,
			} );

			exit.withError( 'Failed to determine if feature is enabled' );
		}
	} );

	if ( exitOnFalse === true && isVIP === false ) {
		exit.withError( 'The feature you are attempting to use is not currently enabled.' );
	}

	return isVIP === true;
}
