/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { NODEJS_SITE_TYPE_IDS, WORDPRESS_SITE_TYPE_IDS } from './constants/vipgo';

/**
 * Is this a WordPress application?
 * @param       {int} appTypeId application type ID
 * @constructor
 */
export function isAppWordPress( appTypeId: number ) {
	return WORDPRESS_SITE_TYPE_IDS.includes( appTypeId );
}

/**
 * Is this a Nodejs application?
 * @param       {int} appTypeId application type ID
 * @constructor
 */
export function isAppNodejs( appTypeId: number ) {
	return NODEJS_SITE_TYPE_IDS.includes( appTypeId );
}
