import debugLib from 'debug';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import {
	exec,
	getEnvironmentPath,
	readEnvironmentData,
	writeEnvironmentData,
} from './dev-environment-core';
import { landoShell } from './dev-environment-lando';

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

/** Remove imported credentials without bootstrapping WordPress or Jetpack. */
export const sanitizeImportedCredentials = async ( lando: Lando, slug: string ) => {
	const sql = fs.readFileSync(
		path.join( __dirname, '../../../assets/dev-env-import-cleanup.sql' ),
		'utf8'
	);
	try {
		await exec( lando, slug, [ 'db', '--execute', sql ] );
		const cacheFlush = fs
			.readFileSync(
				path.join( __dirname, '../../../assets/dev-env-import-cache-flush.php' ),
				'utf8'
			)
			.replace( /^<\?php\s*/, '' );
		if ( ! lando.tasks?.some( task => task.command === 'ssh' ) ) {
			throw new Error( 'Lando shell task is unavailable; local object cache was not invalidated.' );
		}
		await landoShell( lando, getEnvironmentPath( slug ), 'php', 'www-data', [
			'php',
			'-r',
			cacheFlush,
		] );
	} catch ( error ) {
		throw new UserError(
			`Database imported, but local connection credential cleanup failed: ${
				( error as Error ).message
			}`
		);
	} finally {
		// A failed CALL can leave the temporary routine behind.
		await exec( lando, slug, [
			'db',
			'--execute',
			'DROP PROCEDURE IF EXISTS vip_local_import_sanitize;\n',
		] ).catch( () => undefined );
	}
};
