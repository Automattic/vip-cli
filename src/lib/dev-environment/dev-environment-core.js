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
import ejs from 'ejs';
import path from 'path';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import copydir from 'copy-dir';

/**
 * Internal dependencies
 */
import { landoDestroy, landoInfo, landoExec, landoStart, landoStop, landoRebuild } from './dev-environment-lando';
import { searchAndReplace } from '../search-and-replace';
import { printTable, resolvePath } from './dev-environment-cli';
import app from '../api/app';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../constants/dev-environment';
import type { AppInfo, InstanceData } from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const landoFileTemplatePath = path.join( __dirname, '..', '..', '..', 'assets', 'dev-env.lando.template.yml.ejs' );
const nginxFileTemplatePath = path.join( __dirname, '..', '..', '..', 'assets', 'dev-env.nginx.template.conf.ejs' );
const landoFileName = '.lando.yml';
const nginxFileName = 'extra.conf';
const instanceDataFileName = 'instance_data.json';

const homeDirPathInsideContainers = '/user';

const uploadPathString = 'uploads';
const nginxPathString = 'nginx';

type StartEnvironmentOptions = {
	skipRebuild: boolean
};

type SQLImportPaths = {
	resolvedPath: string,
	inContainerPath: string
}

export async function startEnvironment( slug: string, options: StartEnvironmentOptions ) {
	debug( 'Will start an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	if ( options.skipRebuild ) {
		await landoStart( instancePath );
	} else {
		await landoRebuild( instancePath );
	}

	await printEnvironmentInfo( slug );
}

export async function stopEnvironment( slug: string ) {
	debug( 'Will stop an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	await landoStop( instancePath );
}

export async function createEnvironment( instanceData: InstanceData ) {
	const slug = instanceData.siteSlug;
	debug( 'Will create an environment', slug, 'with instanceData: ', instanceData );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( alreadyExists ) {
		throw new Error( 'Environment already exists.' );
	}

	const preProcessedInstanceData = preProcessInstanceData( instanceData );

	await prepareLandoEnv( preProcessedInstanceData, instancePath );
}

export async function updateEnvironment( instanceData: InstanceData ) {
	const slug = instanceData.siteSlug;
	debug( 'Will update an environment', slug, 'with instanceData: ', instanceData );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( ! alreadyExists ) {
		throw new Error( 'Environment doesn\'t exist.' );
	}

	const preProcessedInstanceData = preProcessInstanceData( instanceData );

	await prepareLandoEnv( preProcessedInstanceData, instancePath );
}

function preProcessInstanceData( instanceData: InstanceData ): InstanceData {
	const newInstanceData = {
		...( instanceData: Object ),
	};

	if ( instanceData.mediaRedirectDomain && ! instanceData.mediaRedirectDomain.match( /^http/ ) ) {
		// We need to make sure the redirect is an absolute path
		newInstanceData.mediaRedirectDomain = `https://${ instanceData.mediaRedirectDomain }`;
	}

	return newInstanceData;
}

export async function destroyEnvironment( slug: string, removeFiles: boolean ) {
	debug( 'Will destroy an environment', slug );
	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const landoFilePath = path.join( instancePath, landoFileName );
	if ( fs.existsSync( landoFilePath ) ) {
		debug( 'Lando file exists, will lando destroy.' );
		await landoDestroy( instancePath );
	} else {
		debug( "Lando file doesn't exist, skipping lando destroy." );
	}

	if ( removeFiles ) {
		await fs.promises.rm( instancePath, { recursive: true } );
		console.log( `${ chalk.green( '✓' ) } Environment files deleted successfully.` );
	}
}

export async function printAllEnvironmentsInfo() {
	const allEnvNames = getAllEnvironmentNames();

	debug( 'Will print info for all environments. Names found: ', allEnvNames );

	console.log( 'Found ' + chalk.bold( allEnvNames.length ) + ' environments' + ( allEnvNames.length ? ':' : '.' ) );
	for ( const envName of allEnvNames ) {
		console.log( '\n' );
		await printEnvironmentInfo( envName );
	}
}

export async function printEnvironmentInfo( slug: string ) {
	debug( 'Will get info for an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const appInfo = await landoInfo( instancePath );

	printTable( appInfo );
}

export async function exec( slug: string, args: Array<string> ) {
	debug( 'Will run a wp command on env', slug, 'with args', args );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	const command = args.shift();

	let commandArgs = [ ...args ];
	if ( 'add-site' === command ) {
		commandArgs = [ ...args.map( argument => argument.replace( '--new-site-', '--' ) ) ];
	}

	await landoExec( instancePath, command, commandArgs );
}

export function doesEnvironmentExist( slug: string ): boolean {
	debug( 'Will check for environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	return fs.existsSync( instancePath );
}

export function readEnvironmentData( slug: string ): InstanceData {
	debug( 'Will try to get instance data for environment', slug );

	const instancePath = getEnvironmentPath( slug );

	const instanceDataTargetPath = path.join( instancePath, instanceDataFileName );

	const instanceDataString = fs.readFileSync( instanceDataTargetPath, 'utf8' );

	return JSON.parse( instanceDataString );
}

async function prepareLandoEnv( instanceData, instancePath ) {
	const landoFile = await ejs.renderFile( landoFileTemplatePath, instanceData );
	const nginxFile = await ejs.renderFile( nginxFileTemplatePath, instanceData );
	const instanceDataFile = JSON.stringify( instanceData );

	const landoFileTargetPath = path.join( instancePath, landoFileName );
	const nginxFolderPath = path.join( instancePath, nginxPathString );
	const nginxFileTargetPath = path.join( nginxFolderPath, nginxFileName );
	const instanceDataTargetPath = path.join( instancePath, instanceDataFileName );

	fs.mkdirSync( instancePath, { recursive: true } );
	fs.mkdirSync( nginxFolderPath, { recursive: true } );

	fs.writeFileSync( landoFileTargetPath, landoFile );
	fs.writeFileSync( nginxFileTargetPath, nginxFile );
	fs.writeFileSync( instanceDataTargetPath, instanceDataFile );

	debug( `Lando file created in ${ landoFileTargetPath }` );
	debug( `Nginx file created in ${ nginxFileTargetPath }` );
	debug( `Instance data file created in ${ instanceDataTargetPath }` );
}

function getAllEnvironmentNames() {
	const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();

	const baseDir = path.join( mainEnvironmentPath, 'vip', 'dev-environment' );

	const doWeHaveAnyEnvironment = fs.existsSync( baseDir );

	let envNames = [];
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

	const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', name + '' );
}

export async function getApplicationInformation( appId: number, envType: string | null ): Promise<AppInfo> {
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
			}
		}`;

	const queryResult = await app( appId, fieldsQuery );

	const appData = {};

	if ( queryResult ) {
		appData.id = queryResult.id;
		appData.name = queryResult.name;
		appData.repository = queryResult.repository?.htmlUrl;

		const environments = queryResult.environments || [];
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
				primaryDomain: envData.primaryDomain?.name || '',
			};
		}
	}

	return appData;
}

export async function resolveImportPath( slug: string, fileName: string, searchReplace: string | string[], inPlace: boolean ): Promise<SQLImportPaths> {
	let resolvedPath = resolvePath( fileName );

	if ( ! fs.existsSync( resolvedPath ) ) {
		throw new Error( 'The provided file does not exist or it is not valid (see "--help" for examples)' );
	}

	// Run Search and Replace if the --search-replace flag was provided
	if ( searchReplace && searchReplace.length ) {
		const { outputFileName } = await searchAndReplace( resolvedPath, searchReplace, {
			isImport: true,
			output: true,
			inPlace,
		} );

		if ( typeof outputFileName !== 'string' ) {
			throw new Error( 'Unable to determine location of the intermediate search & replace file.' );
		}

		const environmentPath = getEnvironmentPath( slug );
		const baseName = path.basename( outputFileName );

		resolvedPath = path.join( environmentPath, baseName );
		fs.renameSync( outputFileName, resolvedPath );
	}

	/**
	 * Docker container does not have acces to the host filesystem.
	 * However lando maps os.homedir() to /user in the container. So if we replace the path in the same way
	 * in the Docker container will get the file from within the mapped volume under /user.
	 */
	let inContainerPath = resolvedPath.replace( os.homedir(), homeDirPathInsideContainers );
	if ( path.sep === '\\' ) {
		// Because the file path generated for windows will have \ instead of / we need to replace that as well so that the path inside the container (unix) still works.
		inContainerPath = inContainerPath.replace( /\\/g, '/' );
	}

	debug( `Import file path ${ resolvedPath } will be mapped to ${ inContainerPath }` );
	return {
		resolvedPath,
		inContainerPath,
	};
}

export async function importMediaPath( slug: string, filePath: string ) {
	const resolvedPath = resolvePath( filePath );

	if ( ! fs.existsSync( resolvedPath ) || ! fs.lstatSync( resolvedPath ).isDirectory() ) {
		throw new Error( 'The provided path does not exist or it is not valid (see "--help" for examples)' );
	}

	const files = fs.readdirSync( resolvedPath );
	if ( files.indexOf( uploadPathString ) > -1 ) {
		const confirm = await prompt( {
			type: 'confirm',
			name: 'continue',
			message: 'The provided path contains an uploads folder inside. Do you want to continue?',
		} );

		if ( ! confirm.continue ) {
			return;
		}
	}

	const environmentPath = getEnvironmentPath( slug );
	const uploadsPath = path.join( environmentPath, uploadPathString );

	console.log( `${ chalk.yellow( '-' ) } Started copying files` );
	copydir.sync( resolvedPath, uploadsPath );
	console.log( `${ chalk.green( '✓' ) } Files successfully copied to ${ uploadsPath }.` );
}
