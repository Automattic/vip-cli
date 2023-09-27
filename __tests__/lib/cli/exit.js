/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { withError } from '../../../src/lib/cli/exit';
import env from '../../../src/lib/env';

// Mock console.log()
let output;
global.console = {
	log: message => ( output += message + '\n' ),
	error: message => ( output += message + '\n' ),
};
jest.spyOn( global.console, 'log' );

const mockExit = jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
const ERROR_CODE = 1;

describe( '../../src/lib/cli/exit', () => {
	beforeAll( async () => {
		output = '';
		mockExit.mockClear();
	} );

	it( 'calls process.exit with code 1', () => {
		withError( 'Unexpected error' );
		expect( mockExit ).toHaveBeenCalledWith( ERROR_CODE );
	} );

	it( 'outputs the passed error message', () => {
		withError( 'My error message' );
		expect( output ).toContain( 'My error message' );
	} );

	it( 'outputs debug information', () => {
		withError( 'Oh no' );
		expect( output ).toContain( 'Debug' );
		expect( output ).toContain( `VIP-CLI v${ env.app.version }` );
		expect( output ).toContain( `Node ${ env.node.version }` );
	} );
} );
