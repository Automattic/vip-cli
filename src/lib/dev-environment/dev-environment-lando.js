/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';
import os from 'os';
import path from 'path';
import Lando from 'lando/lib/lando';
import landoUtils from 'lando/plugins/lando-core/lib/utils';
import landoBuildTask from 'lando/plugins/lando-tooling/lib/build';
import chalk from 'chalk';
import App from 'lando/lib/app';
import UserError from '../user-error';
import { readEnvironmentData, writeEnvironmentData } from './dev-environment-core';


const isOnline = require( 'is-online' );
/**
 * Internal dependencies
 */

/**
 * This file will hold all the interactions with lando library
 */
const DEBUG_KEY = '@automattic/vip:bin:dev-environment';
const debug = debugLib( DEBUG_KEY );

let landoConfRoot;

/**
 * @returns {string} User configuration root directory (aka userConfRoot in Lando)
 */
function getLandoUserConfigurationRoot() {
	if ( ! landoConfRoot ) {
		landoConfRoot = path.join( os.tmpdir(), 'lando' );
	}

	return landoConfRoot;
}

/**
 * @returns {object} Lando configuration
 */
function getLandoConfig() {
	const landoPath = path.join( __dirname, '..', '..', '..', 'node_modules', 'lando' );

	debug( `Getting lando config, using path '${ landoPath }' for plugins` );

	const isLandoDebugSelected = ( process.env.DEBUG || '' ).includes( DEBUG_KEY );
	const isAllDebugSelected = process.env.DEBUG === '*';
	const logLevelConsole = ( isAllDebugSelected || isLandoDebugSelected ) ? 'debug' : 'warn';

	return {
		logLevelConsole,
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
		proxyName: 'vip-dev-env-proxy',
		userConfRoot: getLandoUserConfigurationRoot(),
	};
}

export async function landoStart( instancePath: string ) {
	debug( 'Will start lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	addHooks( app, lando );

	await app.start();
}

export async function landoRebuild( instancePath: string ) {
	debug( 'Will rebuild lando app on path:', instancePath );

	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	await ensureNoOrphantProxyContainer( lando );

	addHooks( app, lando );

	await app.rebuild();
}

function addHooks( app: App, lando: Lando ) {
	app.events.on( 'post-start', 1, () => healthcheckHook( app, lando ) );

	/**
	 * Prevent the rebuild from fetching the containers all the time:
	 * Only do so if we're online and last pull was more than 1 week ago
	*/
	app.events.on( 'pre-rebuild', 1, async () => {

		const instanceData = readEnvironmentData( app._name );
		const plus7Days = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days from now
		let overrideOpts = { pull: true, nocache: false };


		instanceData.pullAfter ??= plus7Days;

		if ( await isOnline() && instanceData.pullAfter < Date.now() ) {
			overrideOpts.pull = true;
			instanceData.pullAfter = plus7Days;
			writeEnvironmentData( app._name, instanceData );
		}

		app.opts = { ...( app.opts ), ...overrideOpts };
	} );
}

const healthChecks = {
	database: 'mysql -uroot --silent --execute "SHOW DATABASES;"',
	'vip-search': "curl -s --noproxy '*' -XGET localhost:9200",
	php: '[[ -f /wp/wp-includes/pomo/mo.php ]]',
};

async function healthcheckHook( app: App, lando: Lando ) {
	try {
		await lando.Promise.retry( async () => {
			const list = await lando.engine.list( { project: app.project } );

			const notHealthyContainers = [];
			for ( const container of list ) {
				if ( healthChecks[ container.service ] ) {
					try {
						debug( `Testing ${ container.service }: ${ healthChecks[ container.service ] }` );
						await app.engine.run( {
							id: container.id,
							cmd: healthChecks[ container.service ],
							compose: app.compose,
							project: app.project,
							opts: {
								silent: true,
								noTTY: true,
								cstdio: 'pipe',
								services: [ container.service ],
							},
						} );
					} catch ( exception ) {
						debug( `${ container.service } Health check failed` );
						notHealthyContainers.push( container );
					}
				}
			}

			if ( notHealthyContainers.length ) {
				for ( const container of notHealthyContainers ) {
					console.log( `Waiting for service ${ container.service } ...` );
				}
				return Promise.reject( notHealthyContainers );
			}
		}, { max: 20, backoff: 1000 } );
	} catch ( containersWithFailingHealthCheck ) {
		for ( const container of containersWithFailingHealthCheck ) {
			console.log( chalk.yellow( 'WARNING:' ) + ` Service ${ container.service } failed healthcheck` );
		}
	}
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

	let appInfo = landoUtils.startTable( app );

	const reachableServices = app.info.filter( service => service.urls.length );
	reachableServices.forEach( service => appInfo[ `${ service.service } urls` ] = service.urls );

	const isUp = await isEnvUp( app );
	const frontEndUrl = app.info
		.find( service => 'nginx' === service.service )
		?.urls[ 0 ];

	const extraService = await getExtraServicesConnections( lando, app );
	appInfo = {
		slug: appInfo.name.replace( /^vipdev/, '' ),
		...appInfo,
		...extraService,
	};

	delete appInfo.name;

	appInfo.status = isUp ? chalk.green( 'UP' ) : chalk.yellow( 'DOWN' );

	// Add login information
	if ( frontEndUrl ) {
		const loginUrl = `${ frontEndUrl }wp-admin/`;

		appInfo[ 'Login URL' ] = loginUrl;
		appInfo[ 'Default username' ] = 'vipgo';
		appInfo[ 'Default password' ] = 'password';
	}

	// Add documentation link
	appInfo.Documentation = 'https://docs.wpvip.com/technical-references/vip-local-development-environment/';

	return appInfo;
}

const extraServiceDisplayConfiguration = [
	{
		name: 'vip-search',
		label: 'enterprise search',
		protocol: 'http',
	},
	{
		name: 'phpmyadmin',
		// Skipping, as the phpmyadmin was already printed by the regular services
		skip: true,
	},
];

async function getExtraServicesConnections( lando, app ) {
	const extraServices = {};
	const allServices = await lando.engine.list( { project: app.project } );

	for ( const service of allServices ) {
		const displayConfiguration = extraServiceDisplayConfiguration.find(
			conf => conf.name === service.service
		) || {};

		if ( displayConfiguration.skip ) {
			continue;
		}

		const containerScan = service?.id ? await lando.engine.docker.scan( service?.id ) : null;
		if ( containerScan?.NetworkSettings?.Ports ) {
			const mappings = Object.keys( containerScan.NetworkSettings.Ports )
				.map( internalPort => containerScan.NetworkSettings.Ports[ internalPort ] )
				.filter( externalMapping => externalMapping?.length );

			if ( mappings?.length ) {
				const { HostIp: host, HostPort: port } = mappings[ 0 ][ 0 ];
				const label = displayConfiguration.label || service.service;
				const value = ( displayConfiguration.protocol ? `${ displayConfiguration.protocol }://` : '' ) + `${ host }:${ port }`;
				extraServices[ label ] = value;
			}
		}
	}

	return extraServices;
}

async function isEnvUp( app ) {
	const reachableServices = app.info.filter( service => service.urls.length );
	const urls = reachableServices.map( service => service.urls ).flat();

	const scanResult = await app.scanUrls( urls, { max: 1 } );
	// If all the URLs are reachable than the app is considered 'up'
	return scanResult?.length && scanResult.filter( result => result.status ).length === scanResult.length;
}

export async function landoExec( instancePath: string, toolName: string, args: Array<string>, options: any ) {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const app = lando.getApp( instancePath );
	await app.init();

	if ( ! options.force ) {
		const isUp = await isEnvUp( app );

		if ( ! isUp ) {
			throw new UserError( 'Environment needs to be started before running wp command' );
		}
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

	const task = landoBuildTask( tool, lando );

	const argv = {
		_: args, // eslint-disable-line
	};

	await task.run( argv );
}

/**
 * Sometimes the proxy network seems to disapper leaving only orphant stopped proxy container.
 * It seems to happen while restarting/powering off computer. This container would then failed
 * to start due to missing network.
 *
 * This function tries to detect such scenario and remove the orphant. So that regular flow
 * can safelly add a network and a new proxy container.
 *
 * @param {object} lando Bootstrapped Lando object
 */
async function ensureNoOrphantProxyContainer( lando ) {
	const proxyContainerName = lando.config.proxyContainer;

	const docker = lando.engine.docker;
	const containers = await docker.listContainers( { all: true } );
	const proxyContainerExists = containers.some( container => container.Names.includes( `/${ proxyContainerName }` ) );

	if ( ! proxyContainerExists ) {
		return;
	}

	const proxyContainer = await docker.getContainer( proxyContainerName );
	const status = await proxyContainer.inspect();
	if ( status?.State?.Running ) {
		return;
	}

	await proxyContainer.remove();
}

export async function validateDockerInstalled() {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	lando.log.verbose( 'docker-engine exists: %s', lando.engine.dockerInstalled );
	if ( lando.engine.dockerInstalled === false ) {
		throw Error( 'docker could not be located! Please follow the following instructions to install it - https://docs.docker.com/engine/install/' );
	}
	lando.log.verbose( 'docker-compose exists: %s', lando.engine.composeInstalled );
	if ( lando.engine.composeInstalled === false ) {
		throw Error( 'docker-compose could not be located! Please follow the following instructions to install it - https://docs.docker.com/compose/install/' );
	}
}

export async function validateDockerAccess() {
	const lando = new Lando( getLandoConfig() );
	await lando.bootstrap();

	const docker = lando.engine.docker;
	lando.log.verbose( 'Fetching docker info to verify user is in docker group' );
	try {
		await docker.info();
	} catch ( error ) {
		throw Error( 'Failed to connect to docker. Please verify that the current user is part of docker group and has access to docker commands.' );
	}
}
