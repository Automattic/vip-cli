/**
 * External dependencies
 */
import nock from 'nock';

process.env.API_HOST = 'http://localhost:4000';

// Don't let tests talk to the outside world
nock.disableNetConnect();
