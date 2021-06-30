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

/**
 * Internal dependencies
 */
import { landoDestroy, landoInfo, landoExec, landoStart, landoStop } from './dev-environment-lando';
import { printTable } from './dev-environment-cli';
import app from '../api/app';
import { DEV_ENVIRONMENT_COMPONENTS } from '../constants/dev-environment';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const landoFileTemplatePath = path.join( __dirname, '..', '..', '..', 'assets', 'dev-environment.lando.template.yml.ejs' );
const configDefaultsFilePath = path.join( __dirname, '..', '..', '..', 'assets', 'dev-environment.wp-config-defaults.php' );
const landoFileName = '.lando.yml';

export async function startEnvironment( slug: string ) {
	debug( 'Will start an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoStart( instancePath );

	await printEnvironmentInfo( slug );
}

export async function stopEnvironment( slug: string ) {
	debug( 'Will stop an environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoStop( instancePath );
}

type NewInstanceData = {
	siteSlug: string,
	wpTitle: string,
	multisite: boolean,
	phpVersion: string,
	wordpress: Object,
	muPlugins: Object,
	jetpack: Object,
	clientCode: Object,
}

export async function createEnvironment( instanceData: NewInstanceData ) {
	const slug = instanceData.siteSlug;
	debug( 'Will start an environment', slug, 'with instanceData: ', instanceData );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( alreadyExists ) {
		throw new Error( 'Environment already exists.' );
	}

	const cleanedInstanceData = cleanInstanceData( instanceData );

	await prepareLandoEnv( instanceData, cleanedInstanceData );
}

export async function destroyEnvironment( slug: string, removeFiles: boolean ) {
	debug( 'Will destroy an environment', slug );
	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoDestroy( instancePath );

	if ( removeFiles ) {
		// $FlowFixMe: Seems like a Flow issue, recursive is a valid option and it won't work without it.
		fs.rmdirSync( instancePath, { recursive: true } );
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
		throw new Error( 'Environment not found.' );
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
		throw new Error( 'Environment not found.' );
	}

	const command = args.shift();

	let commandArgs = [ ...args ];
	if ( 'add-site' === command ) {
		commandArgs = [ ...args.map( argument => argument.replace( '--new-site-', '--' ) ) ];
	}

	await landoExec( instancePath, command, commandArgs );
}

export function doesEnvironmentExist( slug: string ) {
	debug( 'Will check for environment', slug );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	return fs.existsSync( instancePath );
}

function cleanInstanceData( instanceData: NewInstanceData ): NewInstanceData {
	const cleanedData = {
		...instanceData,
	};

	// resolve directory path for local mode, so relative paths can work reliably
	for ( const componentKey of DEV_ENVIRONMENT_COMPONENTS ) {
		const component = instanceData[ componentKey ];
		if ( 'local' === component.mode ) {
			component.dir = path.resolve( component.dir );
			cleanedData[ componentKey ] = component;
		}
	}

	return cleanedData;
}

async function prepareLandoEnv( instanceData, instancePath ) {
	const landoFile = await ejs.renderFile( landoFileTemplatePath, instanceData );

	const landoFileTargetPath = path.join( instancePath, landoFileName );
	const configDefaultsTargetPath = path.join( instancePath, 'config' );
	const configDefaultsFileTargetPath = path.join( configDefaultsTargetPath, 'wp-config-defaults.php' );

	fs.mkdirSync( instancePath, { recursive: true } );
	fs.writeFileSync( landoFileTargetPath, landoFile );
	fs.mkdirSync( configDefaultsTargetPath );
	fs.copyFileSync( configDefaultsFilePath, configDefaultsFileTargetPath );

	debug( `Lando file created in ${ landoFileTargetPath }` );
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

export function getEnvironmentPath( name: string ) {
	if ( ! name ) {
		throw new Error( 'Name was not provided' );
	}

	const mainEnvironmentPath = xdgBasedir.data || os.tmpdir();

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', name + '' );
}

export async function getApplicationInformation( appId: number, envType: string | null ) {
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
			isMultisite
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
		}

		if ( envData ) {
			appData.environment = {
				name: envData.name,
				branch: envData.branch,
				type: envData.type,
				isMultisite: envData.isMultisite,
			};
		}
	}

	return appData;
}
