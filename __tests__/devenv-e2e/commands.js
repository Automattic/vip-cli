/**
 * External dependencies
 */
import { join, resolve } from 'node:path';

const vipPath = resolve( __dirname, '../../dist/bin' );

export const vipDevEnvCreate = join( vipPath, 'vip-dev-env-create.js' );
export const vipDevEnvDestroy = join( vipPath, 'vip-dev-env-destroy.js' );
export const vipDevEnvExec = join( vipPath, 'vip-dev-env-exec.js' );
export const vipDevEnvImportMedia = join( vipPath, 'vip-dev-env-import-media.js' );
export const vipDevEnvImportSQL = join( vipPath, 'vip-dev-env-import-sql.js' );
export const vipDevEnvInfo = join( vipPath, 'vip-dev-env-info.js' );
export const vipDevEnvList = join( vipPath, 'vip-dev-env-list.js' );
export const vipDevEnvStart = join( vipPath, 'vip-dev-env-start.js' );
export const vipDevEnvStop = join( vipPath, 'vip-dev-env-stop.js' );
export const vipDevEnvUpdate = join( vipPath, 'vip-dev-env-update.js' );
