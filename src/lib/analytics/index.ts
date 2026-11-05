import debugLib from 'debug';

import env from '../env';

import type Tracks from './clients/tracks';
import type { Response } from 'undici';

const debug = debugLib( '@automattic/vip:analytics' );

/* eslint-disable camelcase */
const client_info = {
	cli_version: env.app.version,
	os_name: env.os.name,
	os_version: env.os.version,
	os_arch: env.os.arch,
	node_version: env.node.version,
};
/* eslint-enable camelcase */

export default class Analytics {
	constructor( private readonly client: Tracks ) {}

	public async trackEvent(
		name: string,
		props: Record< string, unknown > = {}
	): Promise< Response | false > {
		if ( process.env.DO_NOT_TRACK ) {
			debug( `trackEvent() for ${ name } => skipping per DO_NOT_TRACK variable` );
			return false;
		}

		return this.client.trackEvent( name, {
			// eslint-disable-next-line camelcase
			...client_info,
			...props,
		} );
	}
}
