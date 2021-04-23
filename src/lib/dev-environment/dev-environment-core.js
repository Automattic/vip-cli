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
import { landoDestroy, landoInfo, landoRunWp, landoStart, landoStop } from './dev-environment-lando';
import { printTable } from './dev-environment-cli';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

const containerImages = {
	wordpress: {
		image: 'wpvipdev/wordpress',
		tag: '5.6',
	},
	jetpack: {
		image: 'wpvipdev/jetpack',
	},
	muPlugins: {
		image: 'wpvipdev/mu-plugins',
		tag: 'auto',
	},
	clientCode: {
		image: 'wpvipdev/skeleton',
		tag: '181a17d9aedf7da73730d65ccef3d8dbf172a5c5',
	},
};

export const defaults = {
	title: 'VIP Dev',
	multisite: false,
	phpVersion: '7.4',
	jetpack: {
		mode: 'inherit',
	},
	wordpress: {},
	muPlugins: {},
	clientCode: {},
};

[ 'wordpress', 'muPlugins', 'clientCode' ].forEach( type => {
	defaults[ type ] = {
		mode: 'image',
		image: containerImages[ type ].image,
		tag: containerImages[ type ].tag,
	};
} );

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

type NewInstanceOptions = {
	title: string,
	multisite: boolean,
	phpVersion: string,
	wordpress: string,
	muPlugins: string,
	jetpack: string,
	clientCode: string
}

export async function createEnvironment( slug: string, options: NewInstanceOptions ) {
	debug( 'Will start an environment', slug, 'with options: ', options );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const alreadyExists = fs.existsSync( instancePath );

	if ( alreadyExists ) {
		throw new Error( 'Environment already exists.' );
	}

	const instanceData = generateInstanceData( slug, options );

	debug( 'Instance data to create a new environment:', instanceData );

	await prepareLandoEnv( instanceData, instancePath );
}

export async function destroyEnvironment( slug: string ) {
	debug( 'Will destroy an environment', slug );
	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoDestroy( instancePath );

	// $FlowFixMe: Seems like a Flow issue, recursive is a valid option and it won't work without it.
	fs.rmdirSync( instancePath, { recursive: true } );
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

export async function runWp( slug: string, args: Array<string> ) {
	debug( 'Will run a wp command on env', slug, 'with args', args );

	const instancePath = getEnvironmentPath( slug );

	debug( 'Instance path for', slug, 'is:', instancePath );

	const environmentExists = fs.existsSync( instancePath );

	if ( ! environmentExists ) {
		throw new Error( 'Environment not found.' );
	}

	await landoRunWp( instancePath, args );
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

export function generateInstanceData( slug: string, options: NewInstanceOptions ) {
	const instanceData = {
		siteSlug: slug,
		wpTitle: options.title || defaults.title,
		multisite: options.multisite || defaults.multisite,
		phpVersion: options.phpVersion || defaults.phpVersion,
		wordpress: getParamInstanceData( options.wordpress, 'wordpress' ),
		muPlugins: getParamInstanceData( options.muPlugins, 'muPlugins' ),
		jetpack: getParamInstanceData( options.jetpack, 'jetpack' ),
		clientCode: getParamInstanceData( options.clientCode, 'clientCode' ),
	};

	return instanceData;
}

export function getParamInstanceData( passedParam: string, type: string ) {
	if ( passedParam ) {
		// cast to string
		const param = passedParam + '';
		if ( param.includes( '/' ) ) {
			return {
				mode: 'local',
				dir: param,
			};
		}

		if ( type === 'jetpack' && param === 'mu' ) {
			return {
				mode: 'inherit',
			};
		}

		return {
			mode: 'image',
			image: containerImages[ type ].image,
			tag: param,
		};
	}

	return defaults[ type ];
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

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', name );
}

