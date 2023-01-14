// @flow

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { NODEJS_SITE_TYPE_IDS, WORDPRESS_SITE_TYPE_IDS } from './constants/vipgo';

/**
 * Is this a WordPress application?
 *
 * @param {number} appTypeId application type ID
 * @return {boolean} Whether this a WordPress application
 */
export function isAppWordPress( appTypeId: number ): boolean {
	return WORDPRESS_SITE_TYPE_IDS.includes( appTypeId );
}

/**
 * Is this a Nodejs application?
 *
 * @param {number} appTypeId application type ID
 * @return {boolean} Whether this a Node.js application
 */
export function isAppNodejs( appTypeId: number ): boolean {
	return NODEJS_SITE_TYPE_IDS.includes( appTypeId );
}
