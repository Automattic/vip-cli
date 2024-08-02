import Lando from 'lando';

import { exec } from './dev-environment-core';

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
