/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import path from 'path';
import Lando from 'lando/lib/lando';
import landoUtils from 'lando/plugins/lando-core/lib/utils';
import landoBuildTask from 'lando/plugins/lando-tooling/lib/build';
import chalk from 'chalk';

/**
 * Internal dependencies
 */

/**
 * This file will hold all the interactions with lando library
 */

const debug = debugLib( '@automattic/vip:bin:dev-environment-lando' );

function getLandoConfig() {
	const landoPath = path.join( __dirname, '..', '..', '..', 'node_modules', 'lando' );

	debug( `Getting lando config, using path '${ landoPath }' for plugins` );

	return {
		logLevelConsole: 'warn',
		landoFile: '.lando.yml',
		preLandoFiles: [ '.lando.base.yml', '.lando.dist.yml', '.lando.upstream.yml' ],
		postLandoFiles: [ '.lando.local.yml' ],
		pluginDirs: [
			landoPath,
			{
				path: path.join( landoPath, 'integrations' ),
				subdir: '.',
			},
		],
	};
}

export async function landoStart( instancePath: string ) {
	debug( 'Will start lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.start();

	console.log( lando.cli.formatData( landoUtils.startTable( app ), { format: 'table' }, { border: false } ) );
}

export async function landoStop( instancePath: string ) {
	debug( 'Will stop lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.stop();
}

export async function landoDestroy( instancePath: string ) {
	debug( 'Will destroy lando app on path:', instancePath );
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await app.destroy();
}

export async function landoInfo( instancePath: string ) {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	const appInfo = landoUtils.startTable( app );

	const reachableServices = app.info.filter( service => service.urls.length );
	reachableServices.forEach( service => appInfo[ `${ service.service } urls` ] = service.urls );

	const isUp = await isEnvUp( app );

	// Enterprise Search
	const vipSearch = app.info.find( service => service.service === 'vip-search' );
	if ( vipSearch?.external_connection && isUp ) {
		const { host, port } = vipSearch?.external_connection;
		appInfo[ 'enterprise search' ] = `http://${ host }:${ port }`;
	}

	appInfo.status = isUp ? chalk.green( 'UP' ) : chalk.yellow( 'DOWN' );

	// Drop vipdev prefix
	appInfo.name = appInfo.name.replace( /^vipdev/, '' );

	return appInfo;
}

async function isEnvUp( app ) {
	const reachableServices = app.info.filter( service => service.urls.length );
	const urls = reachableServices.map( service => service.urls ).flat();

	const scanResult = await app.scanUrls( urls, { max: 1 } );
	// If all the URLs are reachable than the app is considered 'up'
	return scanResult?.length && scanResult.filter( result => result.status ).length === scanResult.length;
}

export async function landoExec( instancePath: string, toolName: string, args: Array<string> ) {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	const isUp = await isEnvUp( app );

	if ( ! isUp ) {
		throw new Error( 'environment needs to be started before running wp command' );
	}

	const tool = app.config.tooling[ toolName ];
	if ( ! tool ) {
		throw new Error( 'wp is not a known lando task' );
	}

	/*
	 lando is looking in both passed args and process.argv so we need to do a bit of hack to fake process.argv
	 so that lando doesn't try to interpret args not meant for wp.

	 Lando drops first 3 args (<node> <lando> <command>) from process.argv and process rest, so we will fake 3 args + the real args
	*/
	process.argv = [ '0', '1', '3' ].concat( args );

	tool.app = app;
	tool.name = toolName;

	const wpTask = landoBuildTask( tool, lando );

	const argv = {
		_: args,
	};

	await wpTask.run( argv );
}
