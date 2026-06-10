const internalBinLoaders = {
	vip: () => import( '../../bin/vip' ),
	'vip-app': () => import( '../../bin/vip-app' ),
	'vip-app-deploy': () => import( '../../bin/vip-app-deploy' ),
	'vip-app-deploy-validate': () => import( '../../bin/vip-app-deploy-validate' ),
	'vip-app-list': () => import( '../../bin/vip-app-list' ),
	'vip-backup': () => import( '../../bin/vip-backup' ),
	'vip-backup-db': () => import( '../../bin/vip-backup-db' ),
	'vip-cache': () => import( '../../bin/vip-cache' ),
	'vip-cache-purge-url': () => import( '../../bin/vip-cache-purge-url' ),
	'vip-config': () => import( '../../bin/vip-config' ),
	'vip-config-envvar': () => import( '../../bin/vip-config-envvar' ),
	'vip-config-envvar-delete': () => import( '../../bin/vip-config-envvar-delete' ),
	'vip-config-envvar-get': () => import( '../../bin/vip-config-envvar-get' ),
	'vip-config-envvar-get-all': () => import( '../../bin/vip-config-envvar-get-all' ),
	'vip-config-envvar-list': () => import( '../../bin/vip-config-envvar-list' ),
	'vip-config-envvar-set': () => import( '../../bin/vip-config-envvar-set' ),
	'vip-config-software': () => import( '../../bin/vip-config-software' ),
	'vip-config-software-get': () => import( '../../bin/vip-config-software-get' ),
	'vip-config-software-update': () => import( '../../bin/vip-config-software-update' ),
	'vip-db': () => import( '../../bin/vip-db' ),
	'vip-db-phpmyadmin': () => import( '../../bin/vip-db-phpmyadmin' ),
	'vip-defensive-mode': () => import( '../../bin/vip-defensive-mode' ),
	'vip-defensive-mode-configure': () => import( '../../bin/vip-defensive-mode-configure' ),
	'vip-defensive-mode-disable': () => import( '../../bin/vip-defensive-mode-disable' ),
	'vip-defensive-mode-enable': () => import( '../../bin/vip-defensive-mode-enable' ),
	'vip-dev-env': () => import( '../../bin/vip-dev-env' ),
	'vip-dev-env-create': () => import( '../../bin/vip-dev-env-create' ),
	'vip-dev-env-destroy': () => import( '../../bin/vip-dev-env-destroy' ),
	'vip-dev-env-envvar': () => import( '../../bin/vip-dev-env-envvar' ),
	'vip-dev-env-envvar-delete': () => import( '../../bin/vip-dev-env-envvar-delete' ),
	'vip-dev-env-envvar-get': () => import( '../../bin/vip-dev-env-envvar-get' ),
	'vip-dev-env-envvar-get-all': () => import( '../../bin/vip-dev-env-envvar-get-all' ),
	'vip-dev-env-envvar-list': () => import( '../../bin/vip-dev-env-envvar-list' ),
	'vip-dev-env-envvar-set': () => import( '../../bin/vip-dev-env-envvar-set' ),
	'vip-dev-env-exec': () => import( '../../bin/vip-dev-env-exec' ),
	'vip-dev-env-import': () => import( '../../bin/vip-dev-env-import' ),
	'vip-dev-env-import-media': () => import( '../../bin/vip-dev-env-import-media' ),
	'vip-dev-env-import-sql': () => import( '../../bin/vip-dev-env-import-sql' ),
	'vip-dev-env-info': () => import( '../../bin/vip-dev-env-info' ),
	'vip-dev-env-list': () => import( '../../bin/vip-dev-env-list' ),
	'vip-dev-env-logs': () => import( '../../bin/vip-dev-env-logs' ),
	'vip-dev-env-purge': () => import( '../../bin/vip-dev-env-purge' ),
	'vip-dev-env-shell': () => import( '../../bin/vip-dev-env-shell' ),
	'vip-dev-env-start': () => import( '../../bin/vip-dev-env-start' ),
	'vip-dev-env-stop': () => import( '../../bin/vip-dev-env-stop' ),
	'vip-dev-env-sync': () => import( '../../bin/vip-dev-env-sync' ),
	'vip-dev-env-sync-sql': () => import( '../../bin/vip-dev-env-sync-sql' ),
	'vip-dev-env-update': () => import( '../../bin/vip-dev-env-update' ),
	'vip-export': () => import( '../../bin/vip-export' ),
	'vip-export-sql': () => import( '../../bin/vip-export-sql' ),
	'vip-import': () => import( '../../bin/vip-import' ),
	'vip-import-media': () => import( '../../bin/vip-import-media' ),
	'vip-import-media-abort': () => import( '../../bin/vip-import-media-abort' ),
	'vip-import-media-status': () => import( '../../bin/vip-import-media-status' ),
	'vip-import-sql': () => import( '../../bin/vip-import-sql' ),
	'vip-import-sql-status': () => import( '../../bin/vip-import-sql-status' ),
	'vip-import-validate-files': () => import( '../../bin/vip-import-validate-files' ),
	'vip-import-validate-sql': () => import( '../../bin/vip-import-validate-sql' ),
	'vip-logout': () => import( '../../bin/vip-logout' ),
	'vip-logs': () => import( '../../bin/vip-logs' ),
	'vip-search-replace': () => import( '../../bin/vip-search-replace' ),
	'vip-slowlogs': () => import( '../../bin/vip-slowlogs' ),
	'vip-sync': () => import( '../../bin/vip-sync' ),
	'vip-whoami': () => import( '../../bin/vip-whoami' ),
	'vip-wp': () => import( '../../bin/vip-wp' ),
};

export const internalBinNames = Object.freeze( Object.keys( internalBinLoaders ) );

export async function loadInternalBin( binName ) {
	const loader = internalBinLoaders[ binName ];
	if ( ! loader ) {
		return false;
	}

	await loader();
	return true;
}

export function hasInternalBin( binName ) {
	return Object.hasOwn( internalBinLoaders, binName );
}
