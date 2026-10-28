/* eslint-disable id-length */
import { dockerComposify } from 'lando/lib/utils';

import {
	getContainersForProject,
	killProjectContainers,
} from '../../devenv-e2e/helpers/docker-utils';
import { getProjectSlug } from '../../devenv-e2e/helpers/identity';

describe( 'E2E project ownership', () => {
	const originalId = process.env.VIP_DEVENV_E2E_INVOCATION_ID;

	afterEach( () => {
		if ( originalId === undefined ) delete process.env.VIP_DEVENV_E2E_INVOCATION_ID;
		else process.env.VIP_DEVENV_E2E_INVOCATION_ID = originalId;
	} );

	it( 'isolates projects and cleanup across invocations on a shared fake daemon', async () => {
		process.env.VIP_DEVENV_E2E_INVOCATION_ID = '1111111111111111';
		const first = getProjectSlug();
		process.env.VIP_DEVENV_E2E_INVOCATION_ID = '2222222222222222';
		const second = getProjectSlug();
		expect( dockerComposify( first ) ).not.toBe( dockerComposify( second ) );

		const resources = new Map( [
			[ 'first', dockerComposify( first ) ],
			[ 'second', dockerComposify( second ) ],
			[ 'sentinel', 'unrelated' ],
		] );
		const docker = {
			listContainers: jest.fn( async options => {
				const wanted = options.filters.label[ 0 ].split( '=' )[ 1 ];
				return [ ...resources ]
					.filter( ( [ , project ] ) => project === wanted )
					.map( ( [ Id, project ] ) => ( {
						Id,
						Labels: { 'com.docker.compose.project': project },
					} ) );
			} ),
			getContainer: id => ( {
				remove: async () => {
					resources.delete( id );
				},
			} ),
		};

		await expect( killProjectContainers( docker, first ) ).rejects.toThrow(
			/outside this E2E invocation/
		);
		await killProjectContainers( docker, second );
		expect( [ ...resources.keys() ] ).toEqual( [ 'first', 'sentinel' ] );
		process.env.VIP_DEVENV_E2E_INVOCATION_ID = '1111111111111111';
		await killProjectContainers( docker, first );
		expect( [ ...resources.keys() ] ).toEqual( [ 'sentinel' ] );
	} );

	it( 'refuses unexpected labels before removing any container', async () => {
		process.env.VIP_DEVENV_E2E_INVOCATION_ID = '3333333333333333';
		const project = getProjectSlug();
		const docker = {
			listContainers: jest
				.fn()
				.mockResolvedValue( [
					{ Id: 'other', Labels: { 'com.docker.compose.project': 'unrelated' } },
				] ),
			getContainer: jest.fn(),
		};
		await expect( killProjectContainers( docker, project ) ).rejects.toThrow(
			/unexpected project ownership/
		);
		expect( docker.getContainer ).not.toHaveBeenCalled();
	} );

	it( 'finds and removes running and stopped owned containers while preserving unrelated resources', async () => {
		process.env.VIP_DEVENV_E2E_INVOCATION_ID = '4444444444444444';
		const project = getProjectSlug();
		const label = dockerComposify( project );
		const resources = [
			{ Id: 'running', State: 'running', Labels: { 'com.docker.compose.project': label } },
			{ Id: 'stopped', State: 'exited', Labels: { 'com.docker.compose.project': label } },
			{ Id: 'other', State: 'exited', Labels: { 'com.docker.compose.project': 'unrelated' } },
		];
		const removed = [];
		const docker = {
			listContainers: jest.fn( async options =>
				resources.filter(
					item =>
						item.Labels[ 'com.docker.compose.project' ] === label &&
						( options.all || item.State === 'running' )
				)
			),
			getContainer: id => ( {
				remove: async options => {
					removed.push( { id, options } );
				},
			} ),
		};
		expect( ( await getContainersForProject( docker, project ) ).map( item => item.Id ) ).toEqual( [
			'running',
		] );
		expect(
			( await getContainersForProject( docker, project, true ) ).map( item => item.Id )
		).toEqual( [ 'running', 'stopped' ] );
		await killProjectContainers( docker, project );
		expect( removed ).toEqual( [
			{ id: 'running', options: { force: true, v: true } },
			{ id: 'stopped', options: { force: true, v: true } },
		] );
		expect( docker.listContainers ).toHaveBeenLastCalledWith(
			expect.objectContaining( { all: true } )
		);
	} );
} );
