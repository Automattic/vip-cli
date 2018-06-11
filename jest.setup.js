/**
 * External dependencies
 */
import nock from 'nock';

// Don't let tests talk to the outside world
nock.disableNetConnect();
