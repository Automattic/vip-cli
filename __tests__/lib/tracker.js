const mockUuid = jest.fn();
const mockSetUuid = jest.fn();
const mockTrackEvent = jest.fn();
const mockAnalytics = jest.fn( () => ( { trackEvent: mockTrackEvent } ) );
const mockTracks = jest.fn();
const mockPendo = jest.fn();
const mockLoadAnalytics = jest.fn();
const mockLoadTracks = jest.fn();
const mockLoadPendo = jest.fn();

jest.mock( '../../src/lib/token', () => ( {
	__esModule: true,
	default: { uuid: mockUuid, setUuid: mockSetUuid },
} ) );
jest.mock( '../../src/lib/env', () => ( { __esModule: true, default: {} } ) );
jest.mock( '../../src/lib/cli/config', () => ( {
	__esModule: true,
	default: { tracksUserType: 'fixture-user', tracksEventPrefix: 'fixture_' },
} ) );
jest.mock( '../../src/lib/analytics/index', () => {
	mockLoadAnalytics();
	return { __esModule: true, default: mockAnalytics };
} );
jest.mock( '../../src/lib/analytics/clients/tracks', () => {
	mockLoadTracks();
	return { __esModule: true, default: mockTracks };
} );
jest.mock( '../../src/lib/analytics/clients/pendo', () => {
	mockLoadPendo();
	return { __esModule: true, default: mockPendo };
} );

describe( 'tracker initialization and opt-out', () => {
	const originalDoNotTrack = process.env.DO_NOT_TRACK;
	let tracker;

	beforeEach( () => {
		jest.resetModules();
		jest.clearAllMocks();
		delete process.env.DO_NOT_TRACK;
		mockUuid.mockResolvedValue( 'fixture-uuid' );
		mockSetUuid.mockResolvedValue( undefined );
		mockTrackEvent.mockResolvedValue( [ false ] );
		tracker = require( '../../src/lib/tracker' );
	} );

	afterEach( () => {
		if ( originalDoNotTrack === undefined ) {
			delete process.env.DO_NOT_TRACK;
		} else {
			process.env.DO_NOT_TRACK = originalDoNotTrack;
		}
	} );

	it.each( [ '1', '0', 'false', ' ' ] )(
		'avoids UUID access and client loading when DO_NOT_TRACK is %j',
		async value => {
			process.env.DO_NOT_TRACK = value;
			await expect( tracker.trackEvent( 'fixture' ) ).resolves.toEqual( [] );
			await expect( tracker.trackEventWithEnv( 1, 2, 'fixture' ) ).resolves.toEqual( [] );
			await tracker.makeCommandTracker( 'fixture' )( 'start' );
			await tracker.aliasUser( 42 );
			expect( mockUuid ).not.toHaveBeenCalled();
			expect( mockSetUuid ).not.toHaveBeenCalled();
			expect( mockLoadAnalytics ).not.toHaveBeenCalled();
			expect( mockLoadTracks ).not.toHaveBeenCalled();
			expect( mockLoadPendo ).not.toHaveBeenCalled();
			expect( mockTrackEvent ).not.toHaveBeenCalled();
		}
	);

	it.each( [ undefined, '' ] )(
		'initializes and reuses clients when opt-out is %j',
		async value => {
			if ( value !== undefined ) process.env.DO_NOT_TRACK = value;
			await expect( tracker.trackEvent( 'first', { fixture: true } ) ).resolves.toEqual( [
				false,
			] );
			await tracker.trackEvent( 'second' );
			expect( mockUuid ).toHaveBeenCalled();
			expect( mockAnalytics ).toHaveBeenCalledTimes( 1 );
			expect( mockTracks ).toHaveBeenCalledTimes( 1 );
			expect( mockPendo ).toHaveBeenCalledTimes( 1 );
			expect( mockTrackEvent ).toHaveBeenNthCalledWith( 1, 'first', { fixture: true } );
			expect( mockTrackEvent ).toHaveBeenNthCalledWith( 2, 'second', {} );
		}
	);

	it( 'honors opt-out after clients have already initialized', async () => {
		await tracker.trackEvent( 'before' );
		jest.clearAllMocks();
		process.env.DO_NOT_TRACK = '1';
		await expect( tracker.trackEvent( 'after' ) ).resolves.toEqual( [] );
		await tracker.aliasUser( 42 );
		expect( mockUuid ).not.toHaveBeenCalled();
		expect( mockSetUuid ).not.toHaveBeenCalled();
		expect( mockTrackEvent ).not.toHaveBeenCalled();
	} );

	it( 'preserves alias identity updates when tracking is enabled', async () => {
		await tracker.aliasUser( 42 );
		expect( mockTrackEvent ).toHaveBeenCalledWith( '_alias_user', {
			ui: 42,
			_ut: 'fixture-user',
			anonid: 'fixture-uuid',
		} );
		expect( mockSetUuid ).toHaveBeenCalledWith( '42' );
	} );
} );
