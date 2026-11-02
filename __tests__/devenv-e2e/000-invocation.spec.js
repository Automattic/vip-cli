import { getProjectSlug, invocationId, ownsProject } from './helpers/identity';

it( 'propagates an invocation ID to the worker and its project slugs', () => {
	const invocation = invocationId();
	const first = getProjectSlug();
	const second = getProjectSlug();
	expect( first ).toContain( invocation );
	expect( second ).toContain( invocation );
	expect( first ).not.toBe( second );
	expect( ownsProject( first ) ).toBe( true );
	expect( ownsProject( second ) ).toBe( true );
} );
