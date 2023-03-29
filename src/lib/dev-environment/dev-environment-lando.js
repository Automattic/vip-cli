// @flow
// @format

/**
 * External dependencies
 */
import debugLib from 'debug';
import os from 'os';
import fs from 'fs';
import path from 'path';
import Lando from 'lando/lib/lando';
import { buildConfig } from 'lando/lib/bootstrap';
import landoUtils from 'lando/plugins/lando-core/lib/utils';
import landoBuildTask from 'lando/plugins/lando-tooling/lib/build';
import chalk from 'chalk';
import App from 'lando/lib/app';
import dns from 'dns';
import xdgBasedir from 'xdg-basedir';

/**
 * Internal dependencies
 */
import {
	doesEnvironmentExist,
	readEnvironmentData,
	updateEnvironment,
	writeEnvironmentData,
} from './dev-environment-core';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../constants/dev-environment';
import { getDockerSocket, getEngineConfig } from './docker-utils';
import UserError from '../user-error';

/**
 * This file will hold all the interactions with lando library
 */
const DEBUG_KEY = '@automattic/vip:bin:dev-environment';
const debug = debugLib( DEBUG_KEY );

type Record<T, V> = {
	[T]: V
};

/**
 * @return {Promise<object>} Lando configuration
 */
async function getLandoConfig() {
	const nodeModulesPath = path.join( __dirname, '..', '..', '..', 'node_modules' );
	const landoPath = path.join( nodeModulesPath, 'lando' );
	const atLandoPath = path.join( nodeModulesPath, '@lando' );

	debug( `Getting Lando config, using paths '${ landoPath }' and '${ atLandoPath }' for plugins` );

	const isLandoDebugSelected = debugLib.enabled( DEBUG_KEY );
	const isAllDebugSelected = debugLib.enabled( '"*"' );
	let logLevelConsole;
	if ( isAllDebugSelected ) {
		logLevelConsole = 'silly';
	} else if ( isLandoDebugSelected ) {
		logLevelConsole = 'debug';
	} else {
		logLevelConsole = 'warn';
	}

	const vipDir = path.join( xdgBasedir.data || os.tmpdir(), 'vip' );
	const landoDir = path.join( vipDir, 'lando' );
	const fakeHomeDir = path.join( landoDir, 'home' );

	try {
		await fs.promises.mkdir( fakeHomeDir, { recursive: true } );
	} catch ( err ) {
		// Ignore
	}

	const config = {
		logLevelConsole,
		configSources: [ path.join( landoDir, 'config.yml' ) ],
		landoFile: '.lando.yml',
		preLandoFiles: [ '.lando.base.yml', '.lando.dist.yml', '.lando.upstream.yml' ],
		postLandoFiles: [ '.lando.local.yml' ],
		pluginDirs: [
			landoPath,
			{
				path: atLandoPath,
				subdir: '.',
				namespace: '@lando',
			},
		],
		disablePlugins: [
			'@lando/argv',
		],
		proxyName: 'vip-dev-env-proxy',
		userConfRoot: landoDir,
		home: fakeHomeDir,
		domain: 'lndo.site',
		version: 'unknown',
	};

	return buildConfig( config );
}

const appMap: Map<string, App> = new Map();

async function regenerateLandofile( instancePath: string ): Promise<void> {
	const landoFile = path.join( instancePath, '.lando.yml' );

	try {
		const now = new Date().toISOString().replace( /[^\d]/g, '' ).slice( 0, -3 );
		const backup = `${ landoFile }.${ now }`;
		await fs.promises.rename( landoFile, backup );
		console.warn( chalk.yellow( 'Backed up %s to %s' ), landoFile, backup );
	} catch ( err ) {
		// Rename failed - possibly the file does not exist. Silently ignoring.
	}

	const slug = path.basename( instancePath );
	const currentInstanceData = readEnvironmentData( slug );
	await updateEnvironment( currentInstanceData );
}

async function landoRecovery( lando: Lando, instancePath: string, error: Error ): Promise<App> {
	debug( 'Error initializing Lando app', error );
	console.warn( chalk.yellow( 'There was an error initializing Lando, trying to recover...' ) );
	try {
		await regenerateLandofile( instancePath );
	} catch ( err ) {
		console.error( `${ chalk.bold.red( 'Recovery failed, aborting.' ) } Please recreate the environment or contact support.` );
		throw err;
	}

	console.error( chalk.green( 'Recovery successful, trying to initialize again...' ) );
	try {
		const app = lando.getApp( instancePath );
		await app.init();
		return app;
	} catch ( initError ) {
		console.error( `${ chalk.bold.red( 'Initialization failed, aborting.' ) } Please recreate the environment or contact support.` );
		throw initError;
	}
}

async function getLandoApplication( lando: Lando, instancePath: string ): Promise<App> {
	if ( appMap.has( instancePath ) ) {
		return Promise.resolve( appMap.get( instancePath ) );
	}

	if ( ! await doesEnvironmentExist( instancePath ) ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	let app;

	try {
		app = lando.getApp( instancePath );
		await app.init();
	} catch ( error ) {
		app = await landoRecovery( lando, instancePath, error );
	}

	appMap.set( instancePath, app );
	return app;
}

export async function bootstrapLando(): Promise<Lando> {
	const socket = await getDockerSocket();
	const config = await getLandoConfig();
	if ( socket ) {
		config.engineConfig = await getEngineConfig( socket );
	}

	const lando = new Lando( config );
	lando.events.once( 'pre-engine-build', async ( data: App ) => {
		const instanceData = readEnvironmentData( data.name );

		let registryResolvable = false;
		try {
			registryResolvable = ( await dns.promises.lookup( 'ghcr.io' ) ).address || false;
			debug( 'Registry ghcr.io is resolvable' );
		} catch ( err ) {
			debug( 'Registry ghcr.io is not resolvable, image pull might be broken.' );
			registryResolvable = false;
		}

		const pull = registryResolvable && ( instanceData.pullAfter || 0 ) < Date.now();
		if ( Array.isArray( data.opts.pullable ) && Array.isArray( data.opts.local ) && data.opts.local.length === 0 && ! pull ) {
			// Setting `data.opts.pullable` to an empty array prevents Lando from pulling images with `docker pull`.
			// Note that if some of the images are not available, they will still be pulled by `docker-compose`.
			data.opts.local = data.opts.pullable;
			data.opts.pullable = [];
		}

		if ( pull || ! instanceData.pullAfter ) {
			instanceData.pullAfter = Date.now() + ( 7 * 24 * 60 * 60 * 1000 );
			writeEnvironmentData( data.name, instanceData );
		}
	} );

	await lando.bootstrap();
	return lando;
}

export async function landoStart( lando: Lando, instancePath: string ): Promise<void> {
	debug( 'Will start lando app on path:', instancePath );

	const app = await getLandoApplication( lando, instancePath );
	await app.start();
}

export interface LandoLogsOptions {
	follow: boolean;
	service: string;
	timestamps: boolean;
}

export async function landoLogs( lando: Lando, instancePath: string, options: LandoLogsOptions ) {
	debug( 'Will show lando logs on path:', instancePath, ' with options: ', options );

	const app = await getLandoApplication( lando, instancePath );
	const logTask = lando.tasks.find( task => task.command === 'logs' );

	await logTask.run( {
		follow: options.follow,
		service: options.service,
		timestamps: options.timestamps,
		_app: app,
	} );
}

export async function landoRebuild( lando: Lando, instancePath: string ): Promise<void> {
	debug( 'Will rebuild lando app on path:', instancePath );

	const app = await getLandoApplication( lando, instancePath );
	await ensureNoOrphantProxyContainer( lando );
	await app.rebuild();
}

export async function landoStop( lando: Lando, instancePath: string ): Promise<void> {
	debug( 'Will stop lando app on path:', instancePath );

	const app = await getLandoApplication( lando, instancePath );
	await app.stop();
}

export async function landoDestroy( lando: Lando, instancePath: string ): Promise<void> {
	debug( 'Will destroy lando app on path:', instancePath );

	const app = await getLandoApplication( lando, instancePath );
	await app.destroy();
}

export async function landoInfo( lando: Lando, instancePath: string, suppressWarnings: boolean ): Promise<Record<string, any>> {
	const app = await getLandoApplication( lando, instancePath );

	let appInfo = landoUtils.startTable( app );

	const reachableServices = app.info.filter( service => service.urls.length );
	reachableServices.forEach( service => appInfo[ `${ service.service } urls` ] = service.urls );

	const health = await checkEnvHealth( lando, instancePath );
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

	const hasResults = Object.values( health ).length > 0;
	const hasWarnings = Object.values( health ).some( status => ! status );
	if ( hasResults && ! hasWarnings ) {
		appInfo.status = chalk.green( 'UP' );
	} else if ( health.nginx ) {
		appInfo.status = chalk.yellow( 'PARTIALLY UP' );
	} else {
		appInfo.status = chalk.red( 'DOWN' );
	}

	// Add login information
	if ( frontEndUrl ) {
		const loginUrl = `${ frontEndUrl }wp-admin/`;

		appInfo[ 'Login URL' ] = loginUrl;
		appInfo[ 'Default username' ] = 'vipgo';
		appInfo[ 'Default password' ] = 'password';
	}

	if ( ! suppressWarnings && hasWarnings ) {
		let message = chalk.bold.yellow( 'The following services have failed health checks:\n' );
		Object.keys( health ).forEach( service => {
			if ( ! health[ service ] ) {
				message += `${ chalk.red( service ) }\n`;
			}
		} );
		appInfo[ 'Health warnings' ] = message;
	}

	// Add documentation link
	appInfo.Documentation = 'https://docs.wpvip.com/technical-references/vip-local-development-environment/';

	return appInfo;
}

const extraServiceDisplayConfiguration = [
	{
		name: 'elasticsearch',
		label: 'enterprise search',
		protocol: 'http',
	},
	{
		name: 'phpmyadmin',
		// Skipping, as the phpmyadmin was already printed by the regular services
		skip: true,
	},
	{
		name: 'mailhog',
		skip: true,
	},
];

async function getExtraServicesConnections( lando: Lando, app: App ): Promise<Record<string, string>> {
	const extraServices: Record<string, string> = {};
	const allServices = await lando.engine.list( { project: app.project } );

	for ( const service of allServices ) {
		const displayConfiguration = extraServiceDisplayConfiguration.find(
			conf => conf.name === service.service
		) || {};

		if ( displayConfiguration.skip ) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop
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

export async function checkEnvHealth( lando: Lando, instancePath: string ): Promise<Record<string, boolean>> {
	type ScanResult = {
		url: string;
		status: boolean;
		color: 'green' | 'yellow' | 'red';
	};

	const urls: Record<string, string> = {};

	const now = new Date();

	const app = await getLandoApplication( lando, instancePath );
	app.info
		.filter( service => service.urls.length )
		.forEach( service => {
			service.urls.forEach( url => {
				urls[ url ] = service.service;
			} );
		} );

	const scanResults: ScanResult[] = await app.scanUrls( Object.keys( urls ), { max: 1 } );
	const result: Record<string, boolean> = {};

	scanResults.forEach( scanResult => {
		result[ urls[ scanResult.url ] ] = scanResult.status;
	} );

	const duration = new Date().getTime() - now.getTime();
	debug( 'checkEnvHealth took %d ms', duration );

	return result;
}

export async function isEnvUp( lando: Lando, instancePath: string ): Promise<boolean> {
	const now = new Date();
	const app = await getLandoApplication( lando, instancePath );

	const reachableServices = app.info.filter( service => service.urls.length );
	const webUrls = reachableServices.map( service => service.urls ).flat().filter( url => ! url.match( /^https?:\/\/(localhost|127\.0\.0\.1):/ ) );

	const scanResult = await app.scanUrls( webUrls, { max: 1 } );
	const duration = new Date().getTime() - now.getTime();
	debug( 'isEnvUp took %d ms', duration );

	// If all the URLs are reachable then the app is considered 'up'
	return scanResult.length && scanResult.filter( result => result.status ).length === scanResult.length;
}

export async function landoExec( lando: Lando, instancePath: string, toolName: string, args: Array<string>, options: any ) {
	const app = await getLandoApplication( lando, instancePath );

	const tool = app.config.tooling[ toolName ];
	if ( ! tool ) {
		throw new UserError( `${ toolName } is not a known lando task` );
	}

	const savedArgv = process.argv;
	try {
		/*
			lando is looking in both passed args and process.argv so we need to do a bit of hack to fake process.argv
			so that lando doesn't try to interpret args not meant for wp.

			Lando drops first 3 args (<node> <lando> <command>) from process.argv and process rest, so we will fake 3 args + the real args
		*/
		process.argv = [ '0', '1', '3' ].concat( args );

		tool.app = app;
		tool.name = toolName;
		tool.dir = '/';

		if ( options.stdio ) {
			tool.stdio = options.stdio;
		}

		const task = landoBuildTask( tool, lando );

		const argv = {
			// eslint-disable-next-line id-length
			_: args,
		};

		await task.run( argv );
	} finally {
		process.argv = savedArgv;
	}
}

export async function landoShell( lando: Lando, instancePath: string, service: string, user: string, command: string[] ): Promise<void> {
	const app = await getLandoApplication( lando, instancePath );
	const shellTask = lando.tasks.find( task => task.command === 'ssh' );

	if ( ! command.length ) {
		const interactive = process.stdin.isTTY ? '-i' : '';
		command = [ '/bin/sh', '-c', `if [ -x /bin/bash ]; then /bin/bash ${ interactive }; else /bin/sh ${ interactive }; fi; exit 0` ];
	}

	debug( 'Running command "%o" in service "%s" as user "%s"', command, service, user );
	await shellTask.run( {
		command,
		service,
		user,
		_app: app,
	} );
}

/**
 * Sometimes the proxy network seems to disapper leaving only orphant stopped proxy container.
 * It seems to happen while restarting/powering off computer. This container would then failed
 * to start due to missing network.
 *
 * This function tries to detect such scenario and remove the orphant. So that regular flow
 * can safelly add a network and a new proxy container.
 *
 * @param {Object} lando Bootstrapped Lando object
 */
async function ensureNoOrphantProxyContainer( lando: Lando ): Promise<void> {
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

export async function validateDockerInstalled( lando: Lando ): Promise<void> {
	lando.log.verbose( 'docker-engine exists: %s', lando.engine.dockerInstalled );
	if ( lando.engine.dockerInstalled === false ) {
		throw Error( 'docker could not be located! Please follow the following instructions to install it - https://docs.docker.com/engine/install/' );
	}
	lando.log.verbose( 'docker-compose exists: %s', lando.engine.composeInstalled );
	if ( lando.engine.composeInstalled === false ) {
		throw Error( 'docker-compose could not be located! Please follow the following instructions to install it - https://docs.docker.com/compose/install/' );
	}
}

export async function validateDockerAccess( lando: Lando ): Promise<void> {
	const docker = lando.engine.docker;
	lando.log.verbose( 'Fetching docker info to verify Docker connection' );
	try {
		await docker.info();
	} catch ( error ) {
		throw Error( 'Failed to connect to Docker. Please verify that Docker engine (service) is running and follow the troubleshooting instructions for your platform.' );
	}
}
