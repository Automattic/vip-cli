import path from 'node:path';

import {
	parseProjectDescriptor,
	parseWorkerManifest,
	resolvePathWithin,
	validateWorkerName,
} from '../../../src/lib/edge-workers/validation';

describe( 'validateWorkerName', () => {
	it.each( [ 'headers', 'security headers', 'worker.v2', 'A_worker-2' ] )( 'accepts %s', name => {
		expect( validateWorkerName( name ) ).toBe( name );
	} );

	it.each( [
		'',
		'.',
		'..',
		'../outside',
		'folder/worker',
		'folder\\worker',
		'bad:name',
		'trailing.',
		'trailing ',
		'CON',
		'com1',
		'a'.repeat( 65 ),
	] )( 'rejects %s', name => {
		expect( () => validateWorkerName( name ) ).toThrow( /Invalid worker name/ );
	} );
} );

describe( 'resolvePathWithin', () => {
	it( 'resolves below the root', () => {
		expect( resolvePathWithin( '/project/workers/demo', 'assembly/index.ts', 'entry' ) ).toBe(
			path.resolve( '/project/workers/demo/assembly/index.ts' )
		);
	} );

	it( 'rejects traversal outside the root', () => {
		expect( () => resolvePathWithin( '/project/workers/demo', '../secret.ts', 'entry' ) ).toThrow(
			/must stay within/
		);
	} );

	it( 'rejects absolute paths', () => {
		expect( () => resolvePathWithin( '/project/workers/demo', '/tmp/secret.ts', 'entry' ) ).toThrow(
			/relative path/
		);
	} );
} );

describe( 'parseProjectDescriptor', () => {
	it.each( [ null, [], 'assemblyscript' ] )( 'rejects non-object descriptors', value => {
		expect( () => parseProjectDescriptor( value, '/project/edge-workers.json' ) ).toThrow(
			/invalid "type" field/
		);
	} );

	it( 'rejects unknown project types', () => {
		expect( () =>
			parseProjectDescriptor( { type: 'rust' }, '/project/edge-workers.json' )
		).toThrow( /invalid "type" field/ );
	} );

	it( 'parses a supported descriptor', () => {
		expect(
			parseProjectDescriptor(
				{ type: 'assemblyscript', sdk: 'example@1.0.0' },
				'/project/edge-workers.json'
			)
		).toEqual( { type: 'assemblyscript', sdk: 'example@1.0.0' } );
	} );
} );

describe( 'parseWorkerManifest', () => {
	const file = '/project/workers/demo/worker.json';

	it( 'rejects null manifests', () => {
		expect( () => parseWorkerManifest( null, file ) ).toThrow( /must be an object/ );
	} );

	it.each( [ { name: 'demo' }, { name: 'demo', entry: '' } ] )(
		'rejects manifests missing an entry',
		value => {
			expect( () => parseWorkerManifest( value, file ) ).toThrow( /missing an "entry" field/ );
		}
	);

	it( 'rejects entries escaping the worker directory', () => {
		expect( () =>
			parseWorkerManifest(
				{
					name: 'demo',
					entry: '../outside.ts',
				},
				file
			)
		).toThrow( /Worker entry must stay within/ );
	} );

	it( 'rejects invalid worker names', () => {
		expect( () =>
			parseWorkerManifest(
				{
					name: 'folder/worker',
					entry: 'assembly/index.ts',
				},
				file
			)
		).toThrow( /Invalid worker name/ );
	} );

	it.each( [
		{ operator: 'matches', value: '/news' },
		{ operator: 'contains', value: '' },
	] )( 'rejects invalid locations', location => {
		expect( () =>
			parseWorkerManifest( { name: 'demo', entry: 'assembly/index.ts', location }, file )
		).toThrow( /invalid location/ );
	} );

	it( 'rejects invalid failure behavior', () => {
		expect( () =>
			parseWorkerManifest(
				{ name: 'demo', entry: 'assembly/index.ts', on_failure: 'ignore' },
				file
			)
		).toThrow( /invalid "on_failure" field/ );
	} );

	it( 'parses an absent location', () => {
		expect( parseWorkerManifest( { name: 'demo', entry: 'assembly/index.ts' }, file ) ).toEqual( {
			name: 'demo',
			entry: 'assembly/index.ts',
		} );
	} );

	it( 'parses a null location', () => {
		expect(
			parseWorkerManifest( { name: 'demo', entry: 'assembly/index.ts', location: null }, file )
		).toEqual( {
			name: 'demo',
			entry: 'assembly/index.ts',
			location: null,
		} );
	} );

	it.each( [ 'continue', 'error' ] )(
		'parses valid location objects and %s failure behavior',
		onFailure => {
			expect(
				parseWorkerManifest(
					{
						name: 'demo',
						entry: 'assembly/index.ts',
						location: { operator: 'starts_with', value: '/news' },
						on_failure: onFailure,
					},
					file
				)
			).toEqual( {
				name: 'demo',
				entry: 'assembly/index.ts',
				location: { operator: 'starts_with', value: '/news' },
				on_failure: onFailure,
			} );
		}
	);
} );
