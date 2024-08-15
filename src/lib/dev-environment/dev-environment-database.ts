import { exec } from './dev-environment-core';

import type Lando from 'lando';

export const addAdminUser = async ( lando: Lando, slug: string, quiet?: boolean ) => {
	const addUserArg = [
		'wp',
		'dev-env-add-admin',
		'--username=vipgo',
		'--password=password',
		'--skip-plugins',
		'--skip-themes',
	].concat( quiet ? [ '--quiet' ] : [] );
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
