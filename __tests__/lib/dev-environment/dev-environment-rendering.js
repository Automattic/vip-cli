import { printTable } from '../../../src/lib/dev-environment/dev-environment-cli';
import {
	printAllEnvironmentsInfo,
	printEnvironmentInfo,
} from '../../../src/lib/dev-environment/dev-environment-info';
import { landoInfo } from '../../../src/lib/dev-environment/dev-environment-lando';
import {
	doesEnvironmentExist,
	getAllEnvironmentNames,
	getEnvironmentPath,
	readEnvironmentData,
} from '../../../src/lib/dev-environment/dev-environment-state';
import UserError from '../../../src/lib/user-error';

jest.mock( '../../../src/lib/dev-environment/dev-environment-cli', () => ( {
	printTable: jest.fn(),
} ) );
jest.mock( '../../../src/lib/dev-environment/dev-environment-lando', () => ( {
	landoInfo: jest.fn(),
} ) );
jest.mock( '../../../src/lib/dev-environment/dev-environment-state' );
// Rendering must not eagerly load the lifecycle/API/template dependency graph.
jest.mock( '../../../src/lib/dev-environment/dev-environment-core', () => {
	throw new Error( 'Unexpected lifecycle dependency' );
} );

describe( 'dev-environment info rendering', () => {
	let log;
	let warn;
	beforeEach( () => {
		jest.resetAllMocks();
		log = jest.spyOn( console, 'log' ).mockImplementation( () => {} );
		warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
		getEnvironmentPath.mockImplementation( slug => `/fixture/${ slug }` );
		doesEnvironmentExist.mockResolvedValue( true );
		readEnvironmentData.mockReturnValue( { autologinKey: 'fixture-key' } );
	} );
	afterEach( () => jest.restoreAllMocks() );

	it( 'prints an empty inventory without querying environment status', async () => {
		getAllEnvironmentNames.mockReturnValue( [] );
		await printAllEnvironmentsInfo( {}, {} );
		expect( log ).toHaveBeenCalledWith( 'Found 0 environments.' );
		expect( landoInfo ).not.toHaveBeenCalled();
	} );

	it( 'renders environments in inventory order with their stored autologin key', async () => {
		getAllEnvironmentNames.mockReturnValue( [ 'first', 'second' ] );
		landoInfo
			.mockResolvedValueOnce( { name: 'first' } )
			.mockResolvedValueOnce( { name: 'second' } );
		const lando = {};
		await printAllEnvironmentsInfo( lando, {} );
		expect( landoInfo.mock.calls ).toEqual( [
			[ lando, '/fixture/first', { suppressWarnings: false, autologinKey: 'fixture-key' } ],
			[ lando, '/fixture/second', { suppressWarnings: false, autologinKey: 'fixture-key' } ],
		] );
		expect( printTable.mock.calls ).toEqual( [ [ { name: 'first' } ], [ { name: 'second' } ] ] );
	} );

	it( 'warns and continues for invalid environments', async () => {
		getAllEnvironmentNames.mockReturnValue( [ 'invalid', 'valid' ] );
		landoInfo
			.mockRejectedValueOnce( new UserError( 'Invalid fixture' ) )
			.mockResolvedValueOnce( { name: 'valid' } );
		await printAllEnvironmentsInfo( {}, {} );
		expect( warn ).toHaveBeenCalledWith(
			'\nWARNING: "%s" is not a valid environment\n',
			'invalid'
		);
		expect( printTable ).toHaveBeenCalledWith( { name: 'valid' } );
	} );

	it( 'propagates unexpected status failures', async () => {
		getAllEnvironmentNames.mockReturnValue( [ 'broken' ] );
		const error = new Error( 'Status failure' );
		landoInfo.mockRejectedValueOnce( error );
		await expect( printAllEnvironmentsInfo( {}, {} ) ).rejects.toBe( error );
	} );

	it( 'preserves extended component fields and warning options', async () => {
		readEnvironmentData.mockReturnValue( {
			php: 'image:8.3',
			wpTitle: 'Fixture',
			multisite: true,
			xdebug: true,
			xdebugConfig: {},
			cron: true,
			wordpress: { mode: 'image', tag: 'latest' },
			muPlugins: { mode: 'image', tag: 'pinned' },
			appCode: { mode: 'local', dir: '/fixture/code' },
			mediaRedirectDomain: 'example.test',
		} );
		landoInfo.mockResolvedValue( {} );
		await printEnvironmentInfo( {}, 'fixture', { extended: true, suppressWarnings: true } );
		expect( printTable ).toHaveBeenCalledWith( {
			title: 'Fixture',
			multisite: true,
			php: '8.3',
			xdebug: 'enabled (with additional configuration)',
			cron: 'enabled',
			wordpress: '[demo-image]',
			'Mu plugins': 'pinned',
			'App Code': '/fixture/code',
			'Media Redirect': 'example.test',
		} );
		expect( landoInfo.mock.calls[ 0 ][ 2 ].suppressWarnings ).toBe( true );
	} );
} );
