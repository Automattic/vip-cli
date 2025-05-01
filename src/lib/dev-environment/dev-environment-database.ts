import { exec } from './dev-environment-core';
import { readEnvironmentData, writeEnvironmentData } from './dev-environment-core';
import crypto from 'crypto';

import type Lando from 'lando';

const generatePassword = (): string => {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
	const passwordLength = 12;
	const randomBytes = crypto.randomBytes( passwordLength );
	let password = '';

	for ( let i = 0; i < passwordLength; i++ ) {
		const randomIndex = randomBytes[ i ] % chars.length;
		password += chars[ randomIndex ];
	}

	return password;
};

export const addAdminUser = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const password = generatePassword();
	const addUserArg = [
		'wp',
		'dev-env-add-admin',
		'--username=vipgo',
		`--password=${ password }`,
		'--skip-plugins',
		'--skip-themes',
	].concat( quiet ? [ '--quiet' ] : [] );

	// Store the password in instance data
	const instanceData = readEnvironmentData( slug );
	instanceData.adminPassword = password;
	await writeEnvironmentData( slug, instanceData );

	await exec( lando, slug, addUserArg );
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
