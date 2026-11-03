import cases from '../../../__fixtures__/validations/sql-engine-cases.json';
import { SqlEngineScanner } from '../../../src/lib/validations/sql-engine-scanner';

describe( 'SQL engine scanner', () => {
	it.each( cases )( '$name', ( { lines, want } ) => {
		const scanner = new SqlEngineScanner();
		const actual = lines.flatMap( ( line, index ) => scanner.scan( line, index + 1 ) );
		expect( actual ).toEqual( want );
	} );
} );
