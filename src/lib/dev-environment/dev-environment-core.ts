/**
 * External dependencies
 */
import debugLib from 'debug';
import xdgBasedir from 'xdg-basedir';
import fetch from 'node-fetch';
import os from 'os';
import fs from 'fs';
import ejs from 'ejs';
import path from 'path';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import copydir from 'copy-dir';
import type Lando from 'lando';
import { v4 as uuid } from 'uuid';

/**
 * Internal dependencies
 */
import {
	landoDestroy,
	landoInfo,
	landoExec,
	landoStart,
	landoStop,
	landoRebuild,
	landoLogs,
	LandoLogsOptions,
} from './dev-environment-lando';
import { searchAndReplace } from '../search-and-replace';
import {
	handleCLIException,
	printTable,
	promptForComponent,
	resolvePath,
} from './dev-environment-cli';
import app from '../api/app';
import {
	DEV_ENVIRONMENT_NOT_FOUND,
	DEV_ENVIRONMENT_RAW_GITHUB_HOST,
	DEV_ENVIRONMENT_WORDPRESS_VERSIONS_URI,
	DEV_ENVIRONMENT_WORDPRESS_CACHE_KEY,
	DEV_ENVIRONMENT_WORDPRESS_VERSION_TTL,
	DEV_ENVIRONMENT_PHP_VERSIONS,
} from '../constants/dev-environment';
import type { AppInfo, ComponentConfig, InstanceData, WordPressConfig } from './types';
import { appQueryFragments as softwareQueryFragment } from '../config/software';
import UserError from '../user-error';
import { AppEnvironment } from '../../graphqlTypes';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const landoFileTemplatePath = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'assets',
	'dev-env.lando.template.yml.ejs'
);
const nginxFileTemplatePath = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'assets',
	'dev-env.nginx.template.conf.ejs'
);
const landoFileName = '.lando.yml';
const nginxFileName = 'extra.conf';
const instanceDataFileName = 'instance_data.json';

const uploadPathString = 'uploads';
const nginxPathString = 'nginx';

interface StartEnvironmentOptions {
	skipRebuild: boolean;
	skipWpVersionsCheck: boolean;
}

interface WordPressTag {
	ref: string;
	tag: string;
	cacheable: boolean;
	locked: boolean;
	prerelease: boolean;
}

function xdgDataDirectory(): string {
	return xdgBasedir.data?.length ? xdgBasedir.data : os.tmpdir();
}

export async function startEnvironment(
	lando: Lando,
	slug: string,
	options: StartEnvironmentOptions
): Promise< void > {
	debug( 'Will start an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	let updated = false;
	if ( ! options.skipWpVersionsCheck ) {
		updated = await updateWordPressImage( slug );
	}

	if ( options.skipRebuild && ! updated ) {
		await landoStart( lando, instancePath );
	} else {
		await landoRebuild( lando, instancePath );
	}

	await printEnvironmentInfo( lando, slug, { extended: false } );
}

export async function stopEnvironment( lando: Lando, slug: string ): Promise< void > {
	debug( 'Will stop an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	await landoStop( lando, instancePath );
}

export async function createEnvironment( instanceData: InstanceData ): Promise< void > {
	const slug = instanceData.siteSlug;
	debug( 'Will process an environment', slug, 'with instanceData for creation: ', instanceData );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( alreadyExists ) {
		throw new Error( 'Environment already exists.' );
	}

	const preProcessedInstanceData = preProcessInstanceData( instanceData );
	debug( 'Will create an environment', slug, 'with instanceData: ', preProcessedInstanceData );

	await prepareLandoEnv( preProcessedInstanceData, instancePath );
}

export async function updateEnvironment( instanceData: InstanceData ): Promise< void > {
	const slug = instanceData.siteSlug;
	debug( 'Will process an environment', slug, 'with instanceData for updating: ', instanceData );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( ! alreadyExists ) {
		throw new Error( "Environment doesn't exist." );
	}

	const preProcessedInstanceData = preProcessInstanceData( instanceData );
	debug( 'Will create an environment', slug, 'with instanceData: ', preProcessedInstanceData );

	await prepareLandoEnv( preProcessedInstanceData, instancePath );
}

function preProcessInstanceData( instanceData: InstanceData ): InstanceData {
	const newInstanceData = {
		...instanceData,
	};

	if ( instanceData.mediaRedirectDomain && ! /^http/.exec( instanceData.mediaRedirectDomain ) ) {
		// We need to make sure the redirect is an absolute path
		newInstanceData.mediaRedirectDomain = `https://${ instanceData.mediaRedirectDomain }`;
	}

	// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
	newInstanceData.elasticsearch = instanceData.elasticsearch || false; // NOSONAR

	newInstanceData.php =
		instanceData.php ||
		DEV_ENVIRONMENT_PHP_VERSIONS[ Object.keys( DEV_ENVIRONMENT_PHP_VERSIONS )[ 0 ] ];
	if ( newInstanceData.php.startsWith( 'image:' ) ) {
		newInstanceData.php = newInstanceData.php.slice( 'image:'.length );
	}

	// FIXME: isNaN supports only number in TypeScript, actually, because isNaN('123') returns false despite being a string
	if ( isNaN( instanceData.wordpress.tag as unknown as number ) ) {
		newInstanceData.wordpress.tag = 'trunk';
	}

	if ( ! newInstanceData.xdebugConfig ) {
		newInstanceData.xdebugConfig = '';
	}

	if ( ! newInstanceData.xdebug ) {
		newInstanceData.xdebug = false;
	}

	if ( ! newInstanceData.phpmyadmin ) {
		newInstanceData.phpmyadmin = false;
	}

	if ( ! newInstanceData.photon ) {
		newInstanceData.photon = false;
	}

	// Mailpit migration
	if ( ! newInstanceData.mailpit ) {
		newInstanceData.mailpit = newInstanceData.mailhog ?? false;
	}

	// MariaDB migration
	if ( ! newInstanceData.mariadb ) {
		newInstanceData.mariadb = undefined;
	}

	// newInstanceData
	newInstanceData.autologinKey = uuid();

	return newInstanceData;
}

export async function destroyEnvironment(
	lando: Lando,
	slug: string,
	removeFiles: boolean
): Promise< void > {
	debug( 'Will destroy an environment', slug );
	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = await doesEnvironmentExist( instancePath );
	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const landoFilePath = path.join( instancePath, landoFileName );
	if ( fs.existsSync( landoFilePath ) ) {
		debug( 'Lando file exists, will lando destroy.' );
		await landoDestroy( lando, instancePath );
	} else {
		debug( "Lando file doesn't exist, skipping lando destroy." );
	}

	if ( removeFiles ) {
		await fs.promises.rm( instancePath, { recursive: true } );
		console.log( `${ chalk.green( '✓' ) } Environment files deleted successfully.` );
	}
}

interface PrintOptions {
	extended?: boolean;
	suppressWarnings?: boolean;
}

export async function printAllEnvironmentsInfo(
	lando: Lando,
	options: PrintOptions
): Promise< void > {
	const allEnvNames = getAllEnvironmentNames();

	debug( 'Will print info for all environments. Names found: ', allEnvNames );

	console.log(
		'Found ' +
			chalk.bold( allEnvNames.length ) +
			' environments' +
			( allEnvNames.length ? ':' : '.' )
	);
	for ( const envName of allEnvNames ) {
		try {
			console.log( '\n' );
			// eslint-disable-next-line no-await-in-loop
			await printEnvironmentInfo( lando, envName, options );
		} catch ( error ) {
			if ( error instanceof UserError ) {
				console.warn( '\nWARNING: "%s" is not a valid environment\n', envName );
			} else {
				throw error;
			}
		}
	}
}

function parseComponentForInfo( component: ComponentConfig | WordPressConfig ): string {
	if ( component.mode === 'local' ) {
		return component.dir ?? '';
	}
	return component.tag ?? '[demo-image]';
}

export async function showLogs(
	lando: Lando,
	slug: string,
	options: LandoLogsOptions = {}
): Promise< unknown > {
	debug( 'Will display logs command on env', slug, 'with options', options );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	if ( options.service ) {
		const appInfo = await landoInfo( lando, instancePath );
		if ( ! appInfo.services.includes( options.service ) ) {
			throw new UserError(
				`Service '${
					options.service
				}' not found. Please choose from one: ${ appInfo.services.toString() }`
			);
		}
	}

	return landoLogs( lando, instancePath, options );
}

export async function printEnvironmentInfo(
	lando: Lando,
	slug: string,
	options: PrintOptions
): Promise< void > {
	debug( 'Will get info for an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = await doesEnvironmentExist( instancePath );
	if ( ! environmentExists ) {
		throw new UserError( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const environmentData = readEnvironmentData( slug );
	const appInfo = await landoInfo( lando, instancePath, {
		suppressWarnings: !! options.suppressWarnings,
		autologinKey: environmentData.autologinKey,
	} );

	if ( options.extended ) {
		appInfo.title = environmentData.wpTitle;
		appInfo.multisite = !! environmentData.multisite;
		appInfo.php = environmentData.php.split( ':' )[ 1 ];
		appInfo.wordpress = parseComponentForInfo( environmentData.wordpress );
		appInfo[ 'Mu plugins' ] = parseComponentForInfo( environmentData.muPlugins );
		appInfo[ 'App Code' ] = parseComponentForInfo( environmentData.appCode );
		if ( environmentData.mediaRedirectDomain ) {
			appInfo[ 'Media Redirect' ] = environmentData.mediaRedirectDomain;
		}
	}

	printTable( appInfo );
}

export function exec(
	lando: Lando,
	slug: string,
	args: string[],
	options: Record< string, string > = {}
): Promise< unknown > {
	debug( 'Will run a wp command on env', slug, 'with args', args, ' and options', options );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const [ command, ...commandArgs ] = args;
	return landoExec( lando, instancePath, command, commandArgs, options );
}

export async function doesEnvironmentExist( instancePath: string ): Promise< boolean > {
	debug( 'Will check for environment at', instancePath );
	const file = path.join( instancePath, instanceDataFileName );
	try {
		const stats = await fs.promises.stat( file );
		return stats.isFile();
	} catch ( err ) {
		return false;
	}
}

export function readEnvironmentData( slug: string ): InstanceData {
	debug( 'Will try to get instance data for environment', slug );

	const instancePath = getEnvironmentPath( slug );

	const instanceDataTargetPath = path.join( instancePath, instanceDataFileName );

	let instanceDataString;
	let instanceData: InstanceData;
	try {
		instanceDataString = fs.readFileSync( instanceDataTargetPath, 'utf8' );
	} catch ( error: unknown ) {
		const err = error as Error;
		throw new UserError(
			`There was an error reading file "${ instanceDataTargetPath }": ${ err.message }.`
		);
	}

	try {
		instanceData = JSON.parse( instanceDataString ) as InstanceData;
	} catch ( error: unknown ) {
		const err = error as Error;
		throw new UserError(
			`There was an error parsing file "${ instanceDataTargetPath }": ${ err.message }. You may need to recreate the environment.`
		);
	}

	/**
	 ***********************************
	 * BACKWARDS COMPATIBILITY SECTION
	 **********************************
	 */

	// REMOVEME after the wheel of time spins around few times
	if ( instanceData.enterpriseSearchEnabled || instanceData.elasticsearchEnabled ) {
		// enterpriseSearchEnabled and elasticsearchEnabled was renamed to elasticsearch
		instanceData.elasticsearch = ( instanceData.enterpriseSearchEnabled ||
			instanceData.elasticsearchEnabled ) as boolean;
	}

	// REMOVEME after the wheel of time spins around few times
	if ( instanceData.clientCode ) {
		// clientCode was renamed to appCode
		instanceData.appCode = instanceData.clientCode as ComponentConfig;
	}

	if ( instanceData.mailhog ) {
		instanceData.mailpit = instanceData.mailhog;
		delete instanceData.mailhog;
	}

	return instanceData;
}

/**
 * Writes the instance data.
 *
 * @param {string}       slug Env slug
 * @param {InstanceData} data instance data
 * @return {Promise<void>} Promise
 */
export function writeEnvironmentData( slug: string, data: InstanceData ): Promise< void > {
	debug( 'Will try to write instance data for environment', slug );
	const instancePath = getEnvironmentPath( slug );
	const instanceDataTargetPath = path.join( instancePath, instanceDataFileName );

	return fs.promises.writeFile( instanceDataTargetPath, JSON.stringify( data, null, 2 ) );
}

async function prepareLandoEnv(
	instanceData: InstanceData,
	instancePath: string
): Promise< void > {
	const landoFile = await ejs.renderFile( landoFileTemplatePath, instanceData );
	const nginxFile = await ejs.renderFile( nginxFileTemplatePath, instanceData );
	const instanceDataFile = JSON.stringify( instanceData );

	const landoFileTargetPath = path.join( instancePath, landoFileName );
	const nginxFolderPath = path.join( instancePath, nginxPathString );
	const nginxFileTargetPath = path.join( nginxFolderPath, nginxFileName );
	const instanceDataTargetPath = path.join( instancePath, instanceDataFileName );

	await fs.promises.mkdir( instancePath, { recursive: true } );
	await fs.promises.mkdir( nginxFolderPath, { recursive: true } );

	await Promise.all( [
		fs.promises.writeFile( landoFileTargetPath, landoFile ),
		fs.promises.writeFile( nginxFileTargetPath, nginxFile ),
		fs.promises.writeFile( instanceDataTargetPath, instanceDataFile ),
	] );

	debug( `Lando file created in ${ landoFileTargetPath }` );
	debug( `Nginx file created in ${ nginxFileTargetPath }` );
	debug( `Instance data file created in ${ instanceDataTargetPath }` );
}

export function getAllEnvironmentNames(): string[] {
	const mainEnvironmentPath = xdgDataDirectory();

	const baseDir = path.join( mainEnvironmentPath, 'vip', 'dev-environment' );

	const doWeHaveAnyEnvironment = fs.existsSync( baseDir );

	let envNames: string[] = [];
	if ( doWeHaveAnyEnvironment ) {
		const files = fs.readdirSync( baseDir );

		envNames = files.filter( file => {
			const fullPath = path.join( baseDir, file );
			return fs.lstatSync( fullPath ).isDirectory();
		} );
	}

	return envNames;
}

export function getEnvironmentPath( name: string ): string {
	if ( ! name ) {
		throw new Error( 'Name was not provided' );
	}

	const mainEnvironmentPath = xdgDataDirectory();

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', name + '' );
}

export async function getApplicationInformation(
	appId: number,
	envType: string | null
): Promise< AppInfo > {
	// $FlowFixMe: gql template is not supported by flow
	const fieldsQuery = `
		id,
		name,
		repository {
			htmlUrl,
			fullName
		},
		environments {
			id,
			name,
			type,
			branch,
			isMultisite,
			primaryDomain {
				name
			},
			softwareSettings {
				php {
				  ...Software
				}
				wordpress {
				  ...Software
				}
			}
		}`;

	const queryResult = await app( appId, fieldsQuery, softwareQueryFragment );

	const appData = {} as AppInfo;

	if ( queryResult.id ) {
		appData.id = queryResult.id;
		appData.name = queryResult.name;
		appData.repository = queryResult.repository?.htmlUrl;

		// FIXME: This is casted as AppEnvironment[] but pedantically, Parker's schema made it so that the array may contain nullable. Code-wise though, that doesn't actually happen.
		const environments = ( queryResult.environments ?? [] ) as AppEnvironment[];
		let envData;
		if ( envType ) {
			envData = environments.find( candidateEnv => candidateEnv.type === envType );
		} else if ( 1 === environments.length ) {
			envData = environments[ 0 ];
		} else {
			const choices = environments.map( candidateEnv => candidateEnv.type );

			const { env } = await prompt( {
				type: 'select',
				name: 'env',
				message: 'Which environment?',
				choices,
			} );
			envData = environments.find( candidateEnv => candidateEnv.type === env );
		}

		if ( envData ) {
			appData.environment = {
				name: envData.name,
				branch: envData.branch,
				type: envData.type,
				isMultisite: envData.isMultisite,
				primaryDomain: envData.primaryDomain?.name ?? '',
				php: envData.softwareSettings?.php?.current.version ?? '',
				wordpress: envData.softwareSettings?.wordpress?.current.version ?? '',
			};
		}
	}

	return appData;
}

export async function resolveImportPath(
	slug: string,
	fileName: string,
	searchReplace: string | string[] | null,
	inPlace: boolean
): Promise< string > {
	debug( `Will try to resolve path - ${ fileName }` );
	let resolvedPath = resolvePath( fileName );

	debug( `Filename ${ fileName } resolved to ${ resolvedPath }` );

	if ( ! fs.existsSync( resolvedPath ) ) {
		throw new UserError(
			`The provided file ${ resolvedPath } does not exist or it is not valid (see "--help" for examples)`
		);
	}

	if ( fs.lstatSync( resolvedPath ).isDirectory() ) {
		throw new UserError(
			`The provided file ${ resolvedPath } is a directory. Please point to a sql file.`
		);
	}

	// Run Search and Replace if the --search-replace flag was provided
	if ( searchReplace?.length ) {
		const { outputFileName } = await searchAndReplace( resolvedPath, searchReplace, {
			isImport: true,
			output: true,
			inPlace,
		} );

		if ( typeof outputFileName !== 'string' ) {
			throw new Error( 'Unable to determine location of the intermediate search & replace file.' );
		}

		resolvedPath = outputFileName;
	}

	return resolvedPath;
}

export async function importMediaPath( slug: string, filePath: string ) {
	const resolvedPath = resolvePath( filePath );

	if ( ! fs.existsSync( resolvedPath ) || ! fs.lstatSync( resolvedPath ).isDirectory() ) {
		throw new Error(
			'The provided path does not exist or it is not valid (see "--help" for examples)'
		);
	}

	const environmentPath = getEnvironmentPath( slug );
	if ( ! ( await doesEnvironmentExist( environmentPath ) ) ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const files = fs.readdirSync( resolvedPath );
	if ( files.includes( uploadPathString ) ) {
		const confirm = await prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'The provided path contains an uploads folder inside. Do you want to continue?',
		} );

		if ( ! confirm.continue ) {
			return;
		}
	}

	const uploadsPath = path.join( environmentPath, uploadPathString );

	console.log( `${ chalk.yellow( '-' ) } Started copying files` );
	copydir.sync( resolvedPath, uploadsPath );
	console.log( `${ chalk.green( '✓' ) } Files successfully copied to ${ uploadsPath }.` );
}

/**
 * Uses the WordPress versions manifest on github.com
 * Informs the user several things:
 *   - If the WordPress image their env uses is no longer available
 *   - If there is a newer version of the WordPress version currently used
 *   - A choice to use a different image
 *
 * @param {string} slug slug
 * @return {boolean} boolean
 */
async function updateWordPressImage( slug: string ): Promise< boolean > {
	const versions = await getVersionList();
	if ( ! versions.length ) {
		return false;
	}

	let message: string;
	let envData;
	let currentWordPressTag: string;

	// Get the current environment configuration
	try {
		envData = readEnvironmentData( slug );
		currentWordPressTag = envData.wordpress.tag;
		if ( currentWordPressTag === 'trunk' ) {
			return false;
		}
	} catch ( err: unknown ) {
		const error = err as Error & { code?: string };
		// This can throw an exception if the env is build with older vip version
		if ( 'ENOENT' === error.code ) {
			message = 'Environment was created before update was supported.\n\n';
			message += 'To update environment please destroy it and create a new one.';
		} else {
			message = `An error prevented reading the configuration of: ${ slug }\n\n ${ error.message }`;
		}

		await handleCLIException( new Error( message ) );
		return false;
	}

	// sort
	versions.sort( ( before, after ) => ( before.tag < after.tag ? 1 : -1 ) );
	// Newest WordPress Image but that is not trunk
	const newestWordPressImage = versions.find( ( { tag } ) => tag !== 'trunk' );
	console.log(
		'The most recent WordPress version available is: ' + chalk.green( newestWordPressImage?.tag )
	);

	// If the currently used version is the most up to date: exit.
	if ( currentWordPressTag === newestWordPressImage?.tag ) {
		console.log(
			'Environment WordPress version is: ' + chalk.green( currentWordPressTag ) + '  ... 😎 nice! '
		);
		return false;
	}

	// Determine if there is an image available for the current WordPress version
	const match = versions.find( ( { tag } ) => tag === currentWordPressTag );

	// If there is no available image for the currently installed version, give user a path to change
	if ( typeof match === 'undefined' ) {
		console.log(
			`Installed WordPress: ${ currentWordPressTag } has no available container image in repository. `
		);
		console.log( 'You must select a new WordPress image to continue... ' );
	} else {
		console.log(
			'Environment WordPress version is: ' + chalk.yellow( `${ match.tag } (${ match.ref })` )
		);
		if ( envData.wordpress.doNotUpgrade ) {
			return false;
		}
	}

	// Prompt the user to select a new WordPress Version
	const confirm = await prompt( {
		type: 'select',
		name: 'upgrade',
		message: 'Would You like to change the WordPress version? ',
		choices: [ 'yes', 'no', "no (don't ask anymore)" ],
	} );

	// If the user takes the new WP version path
	if ( confirm.upgrade === 'yes' ) {
		console.log( 'Upgrading from: ' + chalk.yellow( currentWordPressTag ) + ' to:' );

		// Select a new image
		const choice: WordPressConfig = await promptForComponent( 'wordpress', false, null );
		const version: WordPressTag | undefined = versions.find(
			( { tag } ) => tag.trim() === choice.tag.trim()
		);

		// Write new data and stage for rebuild
		// FIXME: version?.tag is possibly null. Should we throw if we can't find a version somehow?
		envData.wordpress.tag = version?.tag ?? '';
		envData.wordpress.ref = version?.ref;

		await updateEnvironment( envData );

		return true;
	}
	if ( confirm.upgrade === "no (don't ask anymore)" ) {
		const updateCommand = `vip dev-env update --slug=${ slug }`;
		envData.wordpress.doNotUpgrade = true;
		console.log( "We won't ask about upgrading this environment anymore." );
		console.log( `To manually upgrade please run: ${ chalk.yellow( updateCommand ) }` );
		await updateEnvironment( envData );
	}

	return false;
}

/**
 * Makes a web call to raw.githubusercontent.com
 */
export function fetchVersionList(): Promise< WordPressTag[] > {
	const url = `https://${ DEV_ENVIRONMENT_RAW_GITHUB_HOST }${ DEV_ENVIRONMENT_WORDPRESS_VERSIONS_URI }`;
	return fetch( url ).then( res => res.json() as unknown as WordPressTag[] );
}

/**
 * Encapsulates the logic for determining if a file is expired by an arbitrary TTL
 *
 * @param {string} cacheFile uri of cache file
 * @param {number} ttl       time to live in seconds
 * @return {Promise<boolean>} version list expired true/false
 */
async function isVersionListExpired( cacheFile: string, ttl: number ): Promise< boolean > {
	try {
		const { mtime: expire } = await fs.promises.stat( cacheFile );
		expire.setSeconds( expire.getSeconds() + ttl );

		return +new Date() > +expire;
	} catch ( err ) {
		return true;
	}
}

/**
 * Uses a cache file to keep the version list in tow until it is ultimately outdated
 */
export async function getVersionList(): Promise< WordPressTag[] > {
	let res;
	const mainEnvironmentPath = xdgDataDirectory();
	const cacheFilePath = path.join( mainEnvironmentPath, 'vip' );
	const cacheFile = path.join( cacheFilePath, DEV_ENVIRONMENT_WORDPRESS_CACHE_KEY );
	// Handle from cache
	try {
		// If the path for the cache file doesn't exist, create it
		if ( ! fs.existsSync( cacheFilePath ) ) {
			await fs.promises.mkdir( cacheFilePath, { recursive: true } );
		}

		// If the cache does not exist or has expired, refresh it
		if ( await isVersionListExpired( cacheFile, DEV_ENVIRONMENT_WORDPRESS_VERSION_TTL ) ) {
			res = await fetchVersionList();
			await fs.promises.writeFile( cacheFile, JSON.stringify( res ) );
		}
	} catch ( err ) {
		// Soft error handling here, since it's still possible to use a previously cached file.
		console.log(
			chalk.yellow( 'fetchWordPressVersionList failed to retrieve an updated version list' )
		);
		debug( err );
	}

	// Try to parse the cached file if it exists.
	try {
		const data = await fs.promises.readFile( cacheFile, 'utf8' );
		return JSON.parse( data ) as WordPressTag[];
	} catch ( err ) {
		debug( err );
		return [
			{
				ref: 'HEAD',
				tag: 'trunk',
				cacheable: false,
				locked: false,
				prerelease: true,
			},
		];
	}
}

/**
 * Functions generates workspace config including the launch config
 *
 * @param {string} slug - The slug of the environment to generate workspace config for
 * @return {string} Workspace path
 */
export function generateVSCodeWorkspace( slug: string ) {
	debug( 'Generating VS Code Workspace' );
	const location = getEnvironmentPath( slug );
	const workspacePath = getVSCodeWorkspacePath( slug );
	const instanceData = readEnvironmentData( slug );

	const pathMappings = generatePathMappings( location, instanceData );
	const folders = [ { path: location } ];

	if ( instanceData.muPlugins.dir ) {
		folders.push( { path: instanceData.muPlugins.dir } );
	}
	if ( instanceData.appCode.dir ) {
		folders.push( { path: instanceData.appCode.dir } );
	}

	const workspace = {
		folders,
		launch: {
			version: '0.2.0',
			configurations: [
				{
					name: `Debug ${ slug }`,
					type: 'php',
					request: 'launch',
					port: 9003,
					pathMappings,
				},
			],
		},
	};

	fs.writeFileSync( workspacePath, JSON.stringify( workspace, null, 2 ) );

	return workspacePath;
}

const generatePathMappings = ( location: string, instanceData: InstanceData ) => {
	const pathMappings: Record< string, string > = {};

	if ( instanceData.muPlugins.dir ) {
		pathMappings[ '/wp/wp-content/mu-plugins' ] = instanceData.muPlugins.dir;
	}
	if ( instanceData.appCode.dir ) {
		pathMappings[ '/wp/wp-content/client-mu-plugins' ] = path.resolve(
			instanceData.appCode.dir,
			'client-mu-plugins'
		);
		pathMappings[ '/wp/wp-content/images' ] = path.resolve( instanceData.appCode.dir, 'images' );
		pathMappings[ '/wp/wp-content/languages' ] = path.resolve(
			instanceData.appCode.dir,
			'languages'
		);
		pathMappings[ '/wp/wp-content/plugins' ] = path.resolve( instanceData.appCode.dir, 'plugins' );
		pathMappings[ '/wp/wp-content/private' ] = path.resolve( instanceData.appCode.dir, 'private' );
		pathMappings[ '/wp/wp-content/themes' ] = path.resolve( instanceData.appCode.dir, 'themes' );
		pathMappings[ '/wp/wp-content/vip-config' ] = path.resolve(
			instanceData.appCode.dir,
			'vip-config'
		);
	}

	pathMappings[ '/wp' ] = path.resolve( location, 'wordpress' );

	return pathMappings;
};

export function getVSCodeWorkspacePath( slug: string ) {
	const location = getEnvironmentPath( slug );
	const workspacePath = path.join( location, `${ slug }.code-workspace` );

	return workspacePath;
}
