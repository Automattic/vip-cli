/**
 * Internal dependencies
 */
import Analytics from './analytics/index';
import GoogleAnalytics from './google-analytics';
import Tracks from './tracks';
import env from './env';

// TODO: populate these values
const gaAccountId = '';
const gaUserId = '';
const tracksUserId = '';
const tracksUserType = '';

const analytics = new Analytics( {
	googleAnalytics: new GoogleAnalytics( gaAccountId, gaUserId, env ),
	tracks: new Tracks( tracksUserId, tracksUserType, env ),
} );

export default analytics;
