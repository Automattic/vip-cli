import { parseIPRestrictionsFile, formatIPRestrictionsFile } from '../../../src/lib/api/ip-restrictions.ts';

describe( 'parseIPRestrictionsFile', () => {
	it( 'parses file with mode and groups', () => {
		const fileContent = `# Mode: deny
192.168.1.0/24 #Office network
10.0.0.5 #Office network
1.2.3.4 #Malicious IPs
5.6.7.8 #Malicious IPs`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result ).toEqual( {
			action: 'deny',
			groups: [
				{
					notes: 'Office network',
					ips: [ '192.168.1.0/24', '10.0.0.5' ],
				},
				{
					notes: 'Malicious IPs',
					ips: [ '1.2.3.4', '5.6.7.8' ],
				},
			],
		} );
	} );

	it( 'defaults to deny mode if not specified', () => {
		const fileContent = `192.168.1.1 #Test`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.action ).toBe( 'deny' );
	} );

	it( 'handles allow mode', () => {
		const fileContent = `# Mode: allow
192.168.1.1 #Test`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.action ).toBe( 'allow' );
	} );

	it( 'ignores comment lines', () => {
		const fileContent = `# Mode: deny
# This is a comment
192.168.1.1 #Test
# Another comment`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.groups ).toHaveLength( 1 );
	} );

	it( 'handles empty file', () => {
		const fileContent = `# Mode: deny`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.groups ).toEqual( [] );
	} );

	it( 'handles file with no valid IPs', () => {
		const fileContent = `# Mode: deny
# Just comments`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.groups ).toEqual( [] );
	} );

	it( 'skips lines without proper format', () => {
		const fileContent = `# Mode: deny
192.168.1.1 #Valid
invalid line without hash
1.2.3.4 #Also valid`;

		const result = parseIPRestrictionsFile( fileContent );

		expect( result.groups ).toHaveLength( 2 );
		expect( result.groups[ 0 ].ips ).toContain( '192.168.1.1' );
		expect( result.groups[ 1 ].ips ).toContain( '1.2.3.4' );
	} );
} );

describe( 'formatIPRestrictionsFile', () => {
	it( 'formats config to file format', () => {
		const config = {
			action: 'deny',
			groups: [
				{
					notes: 'Office network',
					ips: [ '192.168.1.0/24', '10.0.0.5' ],
				},
				{
					notes: 'Malicious IPs',
					ips: [ '1.2.3.4' ],
				},
			],
		};

		const result = formatIPRestrictionsFile( config );

		expect( result ).toContain( '# Mode: deny' );
		expect( result ).toContain( '192.168.1.0/24 #Office network' );
		expect( result ).toContain( '10.0.0.5 #Office network' );
		expect( result ).toContain( '1.2.3.4 #Malicious IPs' );
	} );

	it( 'includes metadata when provided', () => {
		const config = {
			action: 'allow',
			groups: [],
		};
		const metadata = {
			environment: '@test.develop',
			timestamp: '2026-03-04 10:00:00 UTC',
		};

		const result = formatIPRestrictionsFile( config, metadata );

		expect( result ).toContain( '# Mode: allow' );
		expect( result ).toContain( '# Exported: 2026-03-04 10:00:00 UTC' );
		expect( result ).toContain( '# Environment: @test.develop' );
	} );

	it( 'handles empty groups', () => {
		const config = {
			action: 'deny',
			groups: [],
		};

		const result = formatIPRestrictionsFile( config );

		expect( result ).toBe( '# Mode: deny\n' );
	} );

	it( 'filters out null IPs', () => {
		const config = {
			action: 'deny',
			groups: [
				{
					notes: 'Test',
					ips: [ '192.168.1.1', null, '10.0.0.1' ],
				},
			],
		};

		const result = formatIPRestrictionsFile( config );

		expect( result ).toContain( '192.168.1.1 #Test' );
		expect( result ).toContain( '10.0.0.1 #Test' );
		expect( result ).not.toContain( 'null' );
	} );
} );

describe( 'parseIPRestrictionsFile and formatIPRestrictionsFile roundtrip', () => {
	it( 'maintains data integrity through parse/format cycle', () => {
		const originalContent = `# Mode: deny
192.168.1.0/24 #Office network
10.0.0.5 #Office network
1.2.3.4 #Malicious IPs`;

		const parsed = parseIPRestrictionsFile( originalContent );
		const formatted = formatIPRestrictionsFile( parsed );
		const reparsed = parseIPRestrictionsFile( formatted );

		expect( reparsed ).toEqual( parsed );
	} );
} );
