import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { print } from 'graphql';

import * as apiModule from '../../src/lib/api';
import {
	createEdgeWorker,
	deleteEdgeWorker,
	getEdgeWorker,
	listEdgeWorkers,
	setEdgeWorkerActive,
	updateEdgeWorker,
	validateEdgeWorker,
} from '../../src/lib/api/edge-workers';
import UserError from '../../src/lib/user-error';

import type { DocumentNode } from 'graphql';

jest.mock( '../../src/lib/api' );

const mockMutate =
	jest.fn< ( options: unknown ) => Promise< { data?: Record< string, unknown > } > >();
const mockQuery =
	jest.fn<
		( options: { query: DocumentNode } ) => Promise< { data?: Record< string, unknown > } >
	>();
const mockedAPI = apiModule as unknown as { default: jest.Mock };

beforeEach( () => {
	mockMutate.mockReset();
	mockQuery.mockReset();
	mockedAPI.default = jest.fn().mockReturnValue( { mutate: mockMutate, query: mockQuery } );
} );

describe( 'edge worker read query contracts', () => {
	beforeEach( () => {
		mockQuery.mockResolvedValue( {
			data: {
				app: {
					environments: [ { id: 3, edgeWorkers: [ { id: 5, name: 'headers' } ] } ],
				},
			},
		} );
	} );

	it( 'omits source and wasmBinary from the default detail query', async () => {
		await getEdgeWorker( 1, 3, 'headers' );

		const queryDocument = mockQuery.mock.calls[ 0 ][ 0 ].query;
		const query = print( queryDocument );

		expect( query ).not.toContain( 'source' );
		expect( query ).not.toContain( 'wasmBinary' );
	} );

	it( 'requests source but never wasmBinary when source is explicitly included', async () => {
		await getEdgeWorker( 1, 3, 'headers', { includeSource: true } );

		const queryDocument = mockQuery.mock.calls[ 0 ][ 0 ].query;
		const query = print( queryDocument );

		expect( query ).toContain( 'source' );
		expect( query ).not.toContain( 'wasmBinary' );
	} );

	it.each( [
		[ 'missing data', undefined ],
		[ 'null app', { app: null } ],
		[ 'non-object app', { app: 'not-an-app' } ],
		[ 'missing environments', { app: {} } ],
		[ 'null environments', { app: { environments: null } } ],
		[ 'non-array environments', { app: { environments: {} } } ],
		[ 'malformed environment', { app: { environments: [ null ] } } ],
		[
			'wrongly typed target environment id',
			{ app: { environments: [ { id: '3', edgeWorkers: [] } ] } },
		],
		[ 'missing target environment', { app: { environments: [ { id: 4, edgeWorkers: [] } ] } } ],
		[ 'missing edgeWorkers', { app: { environments: [ { id: 3 } ] } } ],
		[ 'null edgeWorkers', { app: { environments: [ { id: 3, edgeWorkers: null } ] } } ],
		[ 'non-array edgeWorkers', { app: { environments: [ { id: 3, edgeWorkers: {} } ] } } ],
	] )( 'fails closed for %s', async ( _label, data ) => {
		mockQuery.mockResolvedValueOnce( { data: data as never } );

		const read = listEdgeWorkers( 1, 3 );

		await expect( read ).rejects.toBeInstanceOf( UserError );
		await expect( read ).rejects.toThrow( /EdgeWorkers query returned an invalid response/ );
	} );

	it( 'preserves a legitimate empty edgeWorkers array', async () => {
		mockQuery.mockResolvedValueOnce( {
			data: { app: { environments: [ { id: 3, edgeWorkers: [] } ] } },
		} );

		await expect( listEdgeWorkers( 1, 3 ) ).resolves.toEqual( [] );
	} );
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
