import cases from '../../../__fixtures__/validations/sql-engine-cases.json';
import { SqlEngineScanner } from '../../../src/lib/validations/sql-engine-scanner';

describe( 'SQL engine scanner', () => {
	it.each( cases )( '$name', ( { lines, want, incomplete = false } ) => {
		const scanner = new SqlEngineScanner();
		const actual = lines.flatMap( ( line, index ) => scanner.scan( line, index + 1 ) );
		expect( actual ).toEqual( want );
		let completionError;
		try {
			scanner.finish();
		} catch ( error ) {
			completionError = error;
		}
		expect( completionError?.message ).toBe(
			incomplete
				? 'SQL engine validation could not finish: unterminated quoted value or block comment.'
				: undefined
		);
	} );

	it( 'recognizes a binary BOM on its first input regardless of the line number', () => {
		const scanner = new SqlEngineScanner();
		expect( scanner.scan( '\u00EF\u00BB\u00BFCREATE TABLE t (id INT) ENGINE=MyISAM;', 8 ) ).toEqual(
			[ 8 ]
		);
	} );
} );
