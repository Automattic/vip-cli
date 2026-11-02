import { resolve } from 'node:path';

const vip = resolve( __dirname, '../../../dist/bin/vip.js' );

export const vipDevEnvCreate = [ vip, 'dev-env', 'create' ];
export const vipDevEnvDestroy = [ vip, 'dev-env', 'destroy' ];
export const vipDevEnvExec = [ vip, 'dev-env', 'exec' ];
export const vipDevEnvImportMedia = [ vip, 'dev-env', 'import', 'media' ];
export const vipDevEnvImportSQL = [ vip, 'dev-env', 'import', 'sql' ];
export const vipDevEnvInfo = [ vip, 'dev-env', 'info' ];
export const vipDevEnvList = [ vip, 'dev-env', 'list' ];
export const vipDevEnvShell = [ vip, 'dev-env', 'shell' ];
export const vipDevEnvStart = [ vip, 'dev-env', 'start' ];
export const vipDevEnvStop = [ vip, 'dev-env', 'stop' ];
export const vipDevEnvUpdate = [ vip, 'dev-env', 'update' ];
export const vipDevEnvLogs = [ vip, 'dev-env', 'logs' ];
