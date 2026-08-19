import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as apiModule from '../../src/lib/api';
import {
	createEdgeWorker,
	deleteEdgeWorker,
	setEdgeWorkerActive,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../../src/lib/api/edge-workers';

jest.mock( '../../src/lib/api' );

const mockMutate =
	jest.fn< ( options: unknown ) => Promise< { data?: Record< string, unknown > } > >();
const mockedAPI = apiModule as unknown as { default: jest.Mock };

beforeEach( () => {
	mockMutate.mockReset();
	mockedAPI.default = jest.fn().mockReturnValue( { mutate: mockMutate } );
} );

describe( 'edge worker mutation result contracts', () => {
	it.each( [
		[ 'validateEdgeWorker', () => validateEdgeWorker( 3, 'V0FTTQ==' ) ],
		[ 'createEdgeWorker', () => createEdgeWorker( 3, { name: 'demo', wasmBinary: 'V0FTTQ==' } ) ],
		[ 'updateEdgeWorker', () => updateEdgeWorker( 3, 7, { wasmBinary: 'V0FTTQ==' } ) ],
		[ 'setEdgeWorkerActive', () => setEdgeWorkerActive( 3, 7, true ) ],
	] )( 'rejects a missing %s payload', async ( operation, call ) => {
		mockMutate.mockResolvedValueOnce( { data: { [ operation ]: null } } );

		await expect( call() ).rejects.toThrow( `${ operation } returned no result` );
	} );

	it( 'rejects a false delete result', async () => {
		mockMutate.mockResolvedValueOnce( { data: { deleteEdgeWorker: false } } );

		await expect( deleteEdgeWorker( 3, 7 ) ).rejects.toThrow( /did not confirm deletion/ );
	} );
} );
