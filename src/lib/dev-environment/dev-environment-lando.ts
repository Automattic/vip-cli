import chalk from 'chalk';
import debugLib from 'debug';
import App, { type ScanResult } from 'lando/lib/app';
import { buildConfig } from 'lando/lib/bootstrap';
import Lando, { type LandoConfig } from 'lando/lib/lando';
import landoUtils, { type AppInfo } from 'lando/plugins/lando-core/lib/utils';
import landoBuildTask from 'lando/plugins/lando-tooling/lib/build';
import { lookup } from 'node:dns/promises';
import { mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { dirname } from 'node:path';
import { satisfies } from 'semver';
import xdgBasedir from 'xdg-basedir';

import {
	doesEnvironmentExist,
	readEnvironmentData,
	updateEnvironment,
	writeEnvironmentData,
} from './dev-environment-core';
import { getDockerSocket, getEngineConfig } from './docker-utils';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../constants/dev-environment';
import UserError from '../user-error';

import type { NetworkInspectInfo } from 'dockerode';
import type Landerode from 'lando/lib/docker';
import type { StdioOptions } from 'node:child_process';

export interface LandoExecOptions {
	stdio?: StdioOptions;
}

/**
 * This file will hold all the interactions with lando library
 */
const DEBUG_KEY = '@automattic/vip:bin:dev-environment';
const debug = debugLib( DEBUG_KEY );

/**
 * @return {Promise<LandoConfig>} Lando configuration
 */
async function getLandoConfig(): Promise< LandoConfig > {
	// The path will be smth like `yarn/global/node_modules/lando/lib/lando.js`; we need the path up to `lando` (inclusive)
	const landoPath = dirname( dirname( require.resolve( 'lando' ) ) );
	// The path will be smth like `yarn/global/node_modules/@lando/compose/index.js`; we need the path up to `@lando` (inclusive)
	const atLandoPath = dirname( dirname( require.resolve( '@lando/compose' ) ) );

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

	// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
	const vipDir = path.join( xdgBasedir.data || tmpdir(), 'vip' ); // NOSONAR
	const landoDir = path.join( vipDir, 'lando' );
	const fakeHomeDir = path.join( landoDir, 'home' );

	try {
		await mkdir( fakeHomeDir, { recursive: true } );
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
		disablePlugins: [],
		proxyName: 'vip-dev-env-proxy',
		userConfRoot: landoDir,
		home: fakeHomeDir,
		domain: 'vipdev.lndo.site',
		version: 'unknown',
	};

	return buildConfig( config );
}

const appMap = new Map< string, App >();

async function initLandoApplication( lando: Lando, instancePath: string ): Promise< App > {
	const app = lando.getApp( instancePath );

	app.events.on( 'post-init', 1, () => {
		const initOnly: string[] = [];
		const services = app.config.services as Record< string, Lando.LandoService >;
		Object.keys( services ).forEach( serviceName => {
			if ( services[ serviceName ].initOnly ) {
				initOnly.push( serviceName );
				( app.config.services as Record< string, Lando.LandoService > )[ serviceName ].scanner =
					false;
			}
		} );

		app.services = app.services.filter( service => ! initOnly.includes( service ) );
	} );

	await app.init();
	return app;
}

async function regenerateLandofile( lando: Lando, instancePath: string ): Promise< void > {
	const landoFile = path.join( instancePath, '.lando.yml' );

	try {
		const now = new Date().toISOString().replace( /[^\d]/g, '' ).slice( 0, -3 );
		const backup = `${ landoFile }.${ now }`;
		await rename( landoFile, backup );
		console.warn( chalk.yellow( 'Backed up %s to %s' ), landoFile, backup );
	} catch ( err ) {
		// Rename failed - possibly the file does not exist. Silently ignoring.
	}

	const slug = path.basename( instancePath );
	const currentInstanceData = readEnvironmentData( slug );
	currentInstanceData.pullAfter = 0;
	await updateEnvironment( lando, currentInstanceData );
}

async function landoRecovery( lando: Lando, instancePath: string, error: unknown ): Promise< App > {
	debug( 'Error initializing Lando app', error );
	console.warn( chalk.yellow( 'There was an error initializing Lando, trying to recover...' ) );
	try {
		await regenerateLandofile( lando, instancePath );
	} catch ( err ) {
		console.error(
			`${ chalk.bold.red(
				'Recovery failed, aborting.'
			) } Please recreate the environment or contact support.`
		);

		throw err;
	}

	console.error( chalk.green( 'Recovery successful, trying to initialize again...' ) );
	try {
		return await initLandoApplication( lando, instancePath );
	} catch ( initError ) {
		console.error(
			`${ chalk.bold.red(
				'Initialization failed, aborting.'
			) } Please recreate the environment or contact support.`
		);
		throw initError;
	}
}

async function getLandoApplication( lando: Lando, instancePath: string ): Promise< App > {
	const started = new Date();
	try {
		if ( appMap.has( instancePath ) ) {
			return Promise.resolve( appMap.get( instancePath ) as App );
		}

		if ( ! ( await doesEnvironmentExist( instancePath ) ) ) {
			throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
		}

		let app;

		try {
			app = await initLandoApplication( lando, instancePath );
		} catch ( error ) {
			app = await landoRecovery( lando, instancePath, error );
		}

		appMap.set( instancePath, app );
		return app;
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'getLandoApplication() took %d ms', duration );
	}
}

export async function bootstrapLando(): Promise< Lando > {
	const started = new Date();
	try {
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
				registryResolvable = ( await lookup( 'ghcr.io' ) ).address.length > 0 || false;
				debug( 'Registry ghcr.io is resolvable' );
			} catch ( err ) {
				debug( 'Registry ghcr.io is not resolvable, image pull might be broken.' );
				registryResolvable = false;
			}

			const pull = registryResolvable && ( instanceData.pullAfter ?? 0 ) < Date.now();
			if (
				Array.isArray( data.opts.pullable ) &&
				Array.isArray( data.opts.local ) &&
				data.opts.local.length === 0 &&
				! pull
			) {
				// Setting `data.opts.pullable` to an empty array prevents Lando from pulling images with `docker pull`.
				// Note that if some of the images are not available, they will still be pulled by `docker-compose`.
				data.opts.local = data.opts.pullable;
				data.opts.pullable = [];
			}

			if ( pull || ! instanceData.pullAfter ) {
				instanceData.pullAfter = Date.now() + 7 * 24 * 60 * 60 * 1000;
				await writeEnvironmentData( data.name, instanceData );
			}
		} );

		await lando.bootstrap();
		return lando;
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'bootstrapLando() took %d ms', duration );
	}
}

export async function landoStart( lando: Lando, instancePath: string ): Promise< void > {
	const started = new Date();
	try {
		debug( 'Will start lando app on path:', instancePath );

		const app = await getLandoApplication( lando, instancePath );
		await app.start();
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoStart() took %d ms', duration );
	}
}

export interface LandoLogsOptions {
	follow?: boolean;
	service?: string;
	timestamps?: boolean;
}

export async function landoLogs( lando: Lando, instancePath: string, options: LandoLogsOptions ) {
	const started = new Date();
	try {
		debug( 'Will show lando logs on path:', instancePath, ' with options: ', options );

		const app = await getLandoApplication( lando, instancePath );
		const logTask = lando.tasks.find( task => task.command === 'logs' );

		await logTask?.run( {
			follow: options.follow,
			service: options.service,
			timestamps: options.timestamps,
			_app: app,
		} );
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoLogs() took %d ms', duration );
	}
}

export async function landoRebuild( lando: Lando, instancePath: string ): Promise< void > {
	const started = new Date();
	try {
		debug( 'Will rebuild lando app on path:', instancePath );

		const app = await getLandoApplication( lando, instancePath );

		app.events.on( 'post-uninstall', async () => removeDevToolsVolumes( lando, app ) );

		await ensureNoOrphantProxyContainer( lando );
		await app.rebuild();
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoRebuild() took %d ms', duration );
	}
}

async function getBridgeNetwork( lando: Lando ): Promise< NetworkInspectInfo | null > {
	const networkName = lando.config.networkBridge ?? 'lando_bridge_network';
	try {
		return ( await lando.engine
			.getNetwork( networkName )
			.inspect() ) as Promise< NetworkInspectInfo | null >;
	} catch ( err ) {
		debug( 'Error getting network %s: %s', networkName, ( err as Error ).message );
		return null;
	}
}

async function cleanUpLandoProxy( lando: Lando ): Promise< void > {
	const network = await getBridgeNetwork( lando );
	if ( network?.Containers && Object.keys( network.Containers ).length === 1 ) {
		const proxy = lando.engine.docker.getContainer( lando.config.proxyContainer as string );
		try {
			await proxy.remove( { force: true } );
		} catch ( err ) {
			debug( 'Error removing proxy container: %s', ( err as Error ).message );
		}
	}
}

export async function landoStop( lando: Lando, instancePath: string ): Promise< void > {
	const started = new Date();
	try {
		debug( 'Will stop lando app on path:', instancePath );

		const app = await getLandoApplication( lando, instancePath );
		app.events.once( 'post-stop', () => cleanUpLandoProxy( lando ) );
		await app.stop();
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoStop() took %d ms', duration );
	}
}

export async function landoDestroy( lando: Lando, instancePath: string ): Promise< void > {
	const started = new Date();
	try {
		debug( 'Will destroy lando app on path:', instancePath );

		const app = await getLandoApplication( lando, instancePath );
		app.events.once( 'post-stop', () => cleanUpLandoProxy( lando ) );
		await app.destroy();
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoDestroy() took %d ms', duration );
	}
}

interface LandoInfoOptions {
	suppressWarnings?: boolean;
	autologinKey?: string;
}

interface LandoInfoResult extends AppInfo {
	slug: string;
	status: string;
	'Login URL'?: string;
	'Default username'?: string;
	'Default password'?: string;
	'Health warnings'?: string;
	Documentation: string;
}

export async function landoInfo(
	lando: Lando,
	instancePath: string,
	options: LandoInfoOptions = {}
): Promise< LandoInfoResult > {
	const started = new Date();
	try {
		const app = await getLandoApplication( lando, instancePath );

		const info = landoUtils.startTable( app );

		const reachableServices = app.info.filter( service => service.urls.length );
		reachableServices.forEach( service => ( info[ `${ service.service } urls` ] = service.urls ) );

		const health = await checkEnvHealth( lando, app );
		const frontEndUrl = app.info.find( service => 'nginx' === service.service )?.urls[ 0 ] ?? '';

		const extraService = await getExtraServicesConnections( lando, app );
		const appInfo: Partial< LandoInfoResult > = {
			slug: info.name.replace( /^vipdev/, '' ),
			...info,
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
			let loginUrl = `${ frontEndUrl }wp-admin/`;
			if ( options.autologinKey ) {
				loginUrl += `?vip-dev-autologin=${ options.autologinKey }`;
			}

			appInfo[ 'Login URL' ] = loginUrl;
			appInfo[ 'Default username' ] = 'vipgo';
			appInfo[ 'Default password' ] = 'password';
		}

		if ( ! options.suppressWarnings && hasWarnings ) {
			let message = chalk.bold.yellow( 'The following services have failed health checks:\n' );
			Object.keys( health ).forEach( service => {
				if ( ! health[ service ] ) {
					message += `${ chalk.red( service ) }\n`;
				}
			} );
			appInfo[ 'Health warnings' ] = message;
		}

		// Add documentation link
		appInfo.Documentation = 'https://docs.wpvip.com/vip-local-development-environment/';

		return appInfo as LandoInfoResult;
	} finally {
		const duration = new Date().getTime() - started.getTime();
		debug( 'landoInfo() took %d ms', duration );
	}
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
	{
		name: 'mailpit',
		skip: true,
	},
];

async function getExtraServicesConnections(
	lando: Lando,
	app: App
): Promise< Record< string, string > > {
	const extraServices: Record< string, string > = {};
	const allServices = await lando.engine.list( { project: app.project } );

	const defaultDisplayConfiguration = {
		skip: false,
		label: null,
		protocol: null,
	};

	for ( const service of allServices ) {
		const displayConfiguration =
			extraServiceDisplayConfiguration.find( conf => conf.name === service.service ) ??
			defaultDisplayConfiguration;

		if ( displayConfiguration.skip ) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop
		const containerScan = service.id ? await lando.engine.docker.scan( service.id ) : null;
		if ( containerScan?.NetworkSettings.Ports ) {
			const mappings = Object.values( containerScan.NetworkSettings.Ports ).filter(
				externalMapping => externalMapping?.length
			);

			mappings[ 0 ]?.forEach( ( { HostIp: host, HostPort: port } ) => {
				const label = displayConfiguration.label ?? service.service;
				const value =
					( displayConfiguration.protocol ? `${ displayConfiguration.protocol }://` : '' ) +
					`${ host }:${ port }`;
				if ( extraServices[ label ] ) {
					extraServices[ label ] += `, ${ value }`;
				} else {
					extraServices[ label ] = value;
				}
			} );
		}
	}

	return extraServices;
}

async function tryResolveDomains( urls: string[] ): Promise< void > {
	const domains = [
		...new Set(
			urls
				.filter( url => url.toLowerCase().startsWith( 'http' ) )
				.map( url => {
					try {
						return new URL( url ).hostname;
					} catch ( err ) {
						return undefined;
					}
				} )
				.filter( domain => domain !== undefined )
		),
	];

	const domainsToFix: string[] = [];
	for ( const domain of domains ) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const address = await lookup( domain, 4 );
			debug( '%s resolves to %s', domain, address.address );

			if ( address.address !== '127.0.0.1' ) {
				domainsToFix.push( domain );
				console.warn(
					chalk.yellow.bold( 'WARNING:' ),
					`${ domain } resolves to ${ address.address } instead of 127.0.0.1. Things may not work as expected.`
				);
			}
		} catch ( err ) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			domainsToFix.push( domain );
			console.warn( chalk.yellow.bold( 'WARNING:' ), `Failed to resolve ${ domain }: ${ msg }` );
		}
	}

	if ( domainsToFix.length ) {
		console.warn(
			chalk.yellow( 'Please add the following lines to the hosts file on your system:\n' )
		);
		console.warn( domainsToFix.map( domain => `127.0.0.1 ${ domain }` ).join( '\n' ) );
		console.warn(
			chalk.yellow(
				'\nLearn more: https://docs.wpvip.com/vip-local-development-environment/troubleshooting-dev-env/#h-resolve-networking-configuration-issues\n'
			)
		);
	}
}

async function getRunningServicesForProject(
	docker: Landerode,
	project: string
): Promise< string[] > {
	const containers = await docker.listContainers( {
		filters: {
			label: [ `com.docker.compose.project=${ project }` ],
		},
	} );

	return containers
		.filter( container => container.State === 'running' )
		.map( container => container.Labels[ 'com.docker.compose.service' ] );
}

export async function checkEnvHealth(
	lando: Lando,
	app: App
): Promise< Record< string, boolean > > {
	const urls: Record< string, string > = {};

	const now = new Date();

	app.urls ??= [];
	app.info
		.filter( service => service.urls.length )
		.forEach( service => {
			service.urls.forEach( url => {
				if ( ! /^https?:\/\/(localhost|127\.0\.0\.1):/.exec( url ) ) {
					urls[ url ] = service.service;
				}
			} );
		} );

	const urlsToScan = Object.keys( urls ).filter( url => ! url.includes( '*' ) );
	await tryResolveDomains( urlsToScan );
	app.urls.forEach( entry => {
		// We use different status codes to see if the service is up.
		// We may consider the service is up when Lando considers it is down.
		if ( entry.color !== 'red' ) {
			urlsToScan.splice( urlsToScan.indexOf( entry.url ), 1 );
		}
	} );

	const runningServices = await getRunningServicesForProject( lando.engine.docker, app.project );
	Object.entries( urls ).forEach( ( [ url, service ] ) => {
		if ( ! runningServices.includes( service ) ) {
			( app.urls as ScanResult[] ).push( {
				url,
				color: 'red',
				status: false,
			} );

			debug( 'Service %s is not running, removing %s from the scan queue', service, url );
			urlsToScan.splice( urlsToScan.indexOf( url ), 1 );
		}
	} );

	let scanResults = app.urls;
	if ( urlsToScan.length ) {
		scanResults = scanResults.concat(
			await app.scanUrls( urlsToScan, { max: 1, waitCodes: [ 502, 504 ] } )
		);
	}

	const result: Record< string, boolean > = {};
	scanResults.forEach( scanResult => {
		result[ urls[ scanResult.url ] ] = scanResult.status;
	} );

	const duration = new Date().getTime() - now.getTime();
	debug( 'checkEnvHealth took %d ms', duration );

	return result;
}

export async function isEnvUp( lando: Lando, instancePath: string ): Promise< boolean > {
	const app = await getLandoApplication( lando, instancePath );
	const healthResults = await checkEnvHealth( lando, app );
	return Object.keys( healthResults ).length > 0 && Object.values( healthResults ).every( Boolean );
}

export async function landoExec(
	lando: Lando,
	instancePath: string,
	toolName: string,
	args: string[],
	options: LandoExecOptions
) {
	const app = await getLandoApplication( lando, instancePath );

	const tool = ( app.config.tooling as Record< string, unknown > )[ toolName ] as
		| Record< string, unknown >
		| undefined;
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

export async function landoShell(
	lando: Lando,
	instancePath: string,
	service: string,
	user: string,
	command: string[]
): Promise< void > {
	const app = await getLandoApplication( lando, instancePath );
	const shellTask = lando.tasks.find( task => task.command === 'ssh' );

	if ( ! command.length ) {
		const interactive = process.stdin.isTTY ? '-i' : '';
		command = [
			'/bin/sh',
			'-c',
			`if [ -x /bin/bash ]; then /bin/bash ${ interactive }; else /bin/sh ${ interactive }; fi; exit 0`,
		];
	}

	debug( 'Running command "%o" in service "%s" as user "%s"', command, service, user );
	await shellTask?.run( {
		command,
		service,
		user,
		_app: app,
	} );
}

/**
 * Dev-tools volumes can get stale and is not updated when the new version of dev-tools
 * image is installed. Removing it during rebuild ensures the content is freshly populated
 * on startup.
 *
 * @param {Lando} lando
 * @param {App}   app
 */
async function removeDevToolsVolumes( lando: Lando, app: App ) {
	debug( 'Attempting to removing dev-tools volumes' );

	const scanResult = await lando.engine.docker.listVolumes();
	const devToolsVolumeNames = scanResult.Volumes.map( volume => volume.Name )
		// eslint-disable-next-line security/detect-non-literal-regexp
		.filter( volumeName => new RegExp( `${ app.project }.*devtools` ).test( volumeName ) );

	debug( 'Will remove', devToolsVolumeNames );

	const removalPromises = devToolsVolumeNames.map( volumeName =>
		removeVolume( lando, volumeName )
	);
	await Promise.all( removalPromises );
}

/**
 * Remove volume
 */
async function removeVolume( lando: Lando, volumeName: string ): Promise< void > {
	debug( `Removing devtools volume ${ volumeName }` );
	const devToolsVolume = lando.engine.docker.getVolume( volumeName );
	try {
		await devToolsVolume.remove();
		debug( `${ volumeName } volume removed` );
	} catch ( err ) {
		debug( `Failed to remove volume ${ volumeName }`, err );
	}
}

/**
 * Sometimes the proxy network seems to disapper leaving only orphant stopped proxy container.
 * It seems to happen while restarting/powering off computer. This container would then failed
 * to start due to missing network.
 *
 * This function tries to detect such scenario and remove the orphant. So that regular flow
 * can safely add a network and a new proxy container.
 */
async function ensureNoOrphantProxyContainer( lando: Lando ): Promise< void > {
	const proxyContainerName = lando.config.proxyContainer as string;

	const docker = lando.engine.docker;
	const containers = await docker.listContainers( { all: true } );
	const proxyContainerExists = containers.some( container =>
		container.Names.includes( `/${ proxyContainerName }` )
	);

	if ( ! proxyContainerExists ) {
		return;
	}

	const proxyContainer = docker.getContainer( proxyContainerName );
	const status = await proxyContainer.inspect();
	if ( status.State.Running ) {
		return;
	}

	await proxyContainer.remove();
}

export function validateDockerInstalled( lando: Lando ): void {
	const { engine, composePlugin, compose } = lando.config.versions as {
		engine: string;
		composePlugin: string;
		compose: string;
	};

	lando.log.verbose( 'docker-engine version: %s', engine );
	if ( ! engine ) {
		if ( ! lando.config.dockerBin ) {
			throw new UserError(
				'docker binary could not be located! Please follow the following instructions to install it - https://docs.docker.com/engine/install/'
			);
		}

		throw new UserError(
			'Failed to connect to Docker. Please verify that Docker engine (service) is running and follow the troubleshooting instructions for your platform.'
		);
	}
	lando.log.verbose( 'docker-compose version: %s', compose );
	lando.log.verbose( 'compose plugin version: %s', composePlugin );

	if ( ! composePlugin ) {
		if ( ! compose ) {
			throw new Error(
				'docker-compose binary could not be located! Please follow the following instructions to install it - https://docs.docker.com/compose/install/'
			);
		}

		if ( ! satisfies( compose, '^2.0.0' ) ) {
			throw new Error(
				`docker-compose version ${ compose } is not supported. Please upgrade to version 2.0.0 or higher - https://docs.docker.com/compose/install/`
			);
		}
	}
}
