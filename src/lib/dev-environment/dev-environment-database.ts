import debugLib from 'debug';
import { randomInt } from 'node:crypto';

import { exec, readEnvironmentData, writeEnvironmentData } from './dev-environment-core';

import type Lando from 'lando';

const debug = debugLib( '@automattic/vip:bin:dev-environment' );

export const generatePassword = (): string => {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
	const passwordLength = 12;
	let password = '';

	for ( let idx = 0; idx < passwordLength; idx++ ) {
		const randomIndex = randomInt( 0, chars.length );
		password += chars[ randomIndex ];
	}

	return password;
};

export const addAdminUser = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const instanceData = readEnvironmentData( slug );
	const password =
		! instanceData.adminPassword || instanceData.adminPassword === 'password'
			? generatePassword()
			: instanceData.adminPassword;
	const addUserArg = [
		'wp',
		'dev-env-add-admin',
		'--username=vipgo',
		`--password=${ password }`,
		'--skip-plugins',
		'--skip-themes',
	].concat( quiet ? [ '--quiet' ] : [] );

	await exec( lando, slug, addUserArg );
	// eslint-disable-next-line security/detect-possible-timing-attacks
	if ( password !== instanceData.adminPassword ) {
		instanceData.adminPassword = password;
		await writeEnvironmentData( slug, instanceData );
	}
};

export const dataCleanup = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const cleanupArg = [ 'wp', 'vip', 'data-cleanup', 'sql-import' ].concat(
		quiet ? [ '--quiet' ] : []
	);

	try {
		await exec( lando, slug, cleanupArg, { stdio: 'inherit' } );
	} catch ( error ) {
		// This must not be a fatal error
		console.log( 'WARNING: data cleanup failed.' );
		debug( 'Error during data cleanup:', error );
	}
};

export const reIndexSearch = async ( lando: Lando, slug: string ) => {
	await exec( lando, slug, [ 'wp', 'cli', 'has-command', 'vip-search' ] );
	await exec( lando, slug, [
		'wp',
		'vip-search',
		'index',
		'--setup',
		'--network-wide',
		'--skip-confirm',
	] );
};

export const flushCache = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const cacheArg = [ 'wp', 'cache', 'flush', '--skip-plugins', '--skip-themes' ].concat(
		quiet ? [ '--quiet' ] : []
	);
	await exec( lando, slug, cacheArg );
};

export const executeQuery = async ( lando: Lando, slug: string, query: string ) => {
	await exec( lando, slug, [ 'wp', 'db', 'query', query ] );
};
