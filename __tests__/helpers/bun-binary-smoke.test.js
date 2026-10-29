const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );

const { copyELFExecutable, seedLoopbackToken } = require( '../../helpers/bun-binary-smoke' );

describe( 'native executable smoke file handling', () => {
	let scope;
	beforeEach( () => {
		scope = fs.mkdtempSync( path.join( os.tmpdir(), 'vip-smoke-files-test-' ) );
	} );
	afterEach( () => {
		jest.restoreAllMocks();
		fs.rmSync( scope, { recursive: true, force: true } );
	} );

	const elf = marker =>
		Buffer.concat( [ Buffer.from( [ 0x7f, 0x45, 0x4c, 0x46 ] ), Buffer.from( marker ) ] );

	it( 'copies the validated contents into an owner-only executable', () => {
		const input = path.join( scope, 'input' );
		const output = path.join( scope, 'copy' );
		fs.writeFileSync( input, elf( 'fixture' ) );
		copyELFExecutable( input, output );
		expect( fs.readFileSync( output ) ).toEqual( elf( 'fixture' ) );
		if ( process.platform !== 'win32' ) {
			// Windows does not enforce POSIX mode bits.
			// eslint-disable-next-line no-bitwise, jest/no-conditional-expect
			expect( fs.statSync( output ).mode & 0o777 ).toBe( 0o700 );
		}
	} );

	it( 'pins the opened file when its pathname is replaced after validation', () => {
		const input = path.join( scope, 'input' );
		const output = path.join( scope, 'copy' );
		fs.writeFileSync( input, elf( 'validated' ) );
		const fstat = fs.fstatSync;
		jest.spyOn( fs, 'fstatSync' ).mockImplementationOnce( descriptor => {
			const metadata = fstat( descriptor );
			fs.renameSync( input, path.join( scope, 'original' ) );
			fs.writeFileSync( input, elf( 'replacement' ) );
			return metadata;
		} );
		copyELFExecutable( input, output );
		expect( fs.readFileSync( output ) ).toEqual( elf( 'validated' ) );
		expect( fs.readFileSync( input ) ).toEqual( elf( 'replacement' ) );
	} );

	it( 'rejects non-native content before creating the executable', () => {
		const input = path.join( scope, 'input' );
		const output = path.join( scope, 'copy' );
		fs.writeFileSync( input, '#!/bin/sh\nexit 0\n' );
		expect( () => copyELFExecutable( input, output ) ).toThrow( 'Target must be a native ELF' );
		expect( fs.existsSync( output ) ).toBe( false );
	} );

	it( 'does not overwrite an existing destination', () => {
		const input = path.join( scope, 'input' );
		const output = path.join( scope, 'copy' );
		fs.writeFileSync( input, elf( 'fixture' ) );
		fs.writeFileSync( output, 'existing' );
		expect( () => copyELFExecutable( input, output ) ).toThrow( /EEXIST/ );
		expect( fs.readFileSync( output, 'utf8' ) ).toBe( 'existing' );
	} );

	it( 'creates the loopback fixture store and preserves existing entries', () => {
		const env = { XDG_CONFIG_HOME: scope };
		const host = 'http://127.0.0.1:40123';
		const store = path.join( scope, 'configstore', 'vip-go-cli.json' );
		seedLoopbackToken( env, host, 'first-fixture' );
		const values = JSON.parse( fs.readFileSync( store, 'utf8' ) );
		values.unrelated = 'preserve';
		fs.writeFileSync( store, JSON.stringify( values ) );
		seedLoopbackToken( env, host, 'second-fixture' );
		expect( JSON.parse( fs.readFileSync( store, 'utf8' ) ) ).toEqual( {
			'vip-go-cli:http---127-0-0-1-40123': 'second-fixture',
			unrelated: 'preserve',
		} );
	} );

	it( 'propagates malformed fixture JSON without replacing it', () => {
		const store = path.join( scope, 'configstore', 'vip-go-cli.json' );
		fs.mkdirSync( path.dirname( store ) );
		fs.writeFileSync( store, '{broken' );
		expect( () =>
			seedLoopbackToken( { XDG_CONFIG_HOME: scope }, 'http://127.0.0.1:40123', 'fixture' )
		).toThrow( SyntaxError );
		expect( fs.readFileSync( store, 'utf8' ) ).toBe( '{broken' );
	} );
} );
