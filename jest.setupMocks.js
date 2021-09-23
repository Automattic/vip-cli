/**
 * Internal dependencies
 */
import * as apiConfig from './src/lib/cli/apiConfig';

// This function is mocked globally because it is called by trackEvent.
jest.spyOn( apiConfig, 'checkIfUserIsVip' ).mockResolvedValue( true );
