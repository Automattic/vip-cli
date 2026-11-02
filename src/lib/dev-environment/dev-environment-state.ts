import debugLib from 'debug';
import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import { xdgData } from '../xdg-data';

import type { ComponentConfig, InstanceData } from './types';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );
const instanceDataFileName = 'instance_data.json';

export async function doesEnvironmentExist( instancePath: string ): Promise< boolean > {
	debug( 'Will check for environment at %s', instancePath );
	const file = path.join( instancePath, instanceDataFileName );
	try {
		const stats = await fs.promises.stat( file );
		return stats.isFile();
	} catch {
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
			`There was an error reading file "${ instanceDataTargetPath }": ${ err.message }.`,
			{ cause: error }
		);
	}

	try {
		instanceData = JSON.parse( instanceDataString ) as InstanceData;
	} catch ( error: unknown ) {
		const err = error as Error;
		throw new UserError(
			`There was an error parsing file "${ instanceDataTargetPath }": ${ err.message }. You may need to recreate the environment.`,
			{ cause: error }
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

export function getAllEnvironmentNames(): string[] {
	const mainEnvironmentPath = xdgData();

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

	const mainEnvironmentPath = xdgData();

	return path.join( mainEnvironmentPath, 'vip', 'dev-environment', String( name ) );
}
