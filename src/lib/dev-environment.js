/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import xdgBasedir from 'xdg-basedir';
import os from 'os';
import fs from 'fs';

/**
 * Internal dependencies
 */
import { trackEvent } from 'lib/tracker';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const defaultEnvironmentSlug = 'vip-local';

export async function startEnvironment( slug, options ) {
	debug( 'Will create environment', slug, 'with options: ', options );

	const instancePath = getEnvironmentPath( slug );

	const alreadyExists = fs.existsSync( instancePath );
	// if ( fs.existsSync( instancePath ) ) {
	// 	return console.error( 'Instance ' + name + ' already exists' );
	// }
	// fs.mkdirSync( instancePath );

	if ( alreadyExists ) {
		const parameters = Object
			.keys( options || {} )
			.filter( key => key !== 'slug' );
		if ( parameters ) {
			throw new Error(
				`The environment ${ slug } already exists and we can not change it's configuration` +
				`( configuration parameters - ${ parameters.join( ', ' ) } found ).` +
				' Destroy the environment first if you would like to recreate it.' )
		}
	}

	// const instanceData = {
	// 	siteSlug: slug,
	// 	wpTitle: options.title || 'VIP Dev',
	// 	multisite: options.multisite || false,
	// 	wordpress: {},
	// 	muplugins: {},
	// 	jetpack: {},
	// 	clientcode: {},
	// };

	// updateSiteDataWithOptions( instanceData, options );

	// await prepareLandoEnv( instanceData, instancePath );

	// console.log( instanceData );
	// fs.writeFileSync( instancePath + '/instanceData.json', JSON.stringify( instanceData ) );

	// if ( options.start ) {
	// 	landoStart( instancePath );
	// 	console.log( 'Lando environment created on directory "' + instancePath + '" and started.' );
	// } else {
	// 	console.log( 'Lando environment created on directory "' + instancePath + '".' );
	// 	console.log( 'You can cd into that directory and run "lando start"' );
	// }
}

export function getEnvironmentPath( name ) {
	if ( ! name ) {
		throw new Error( 'Name was not provided' );
	}

	const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();

	return `${ mainEnvironmentPath }/vip/dev-environment/${ name }`;
}