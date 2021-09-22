/**
 * Internal dependencies
 */
import * as apiConfig from './src/lib/cli/apiConfig';

jest.spyOn( apiConfig, 'checkIfUserIsVip' ).mockResolvedValue( true );
