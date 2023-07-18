export function tryConvertJson(value: string): any;
export function merge(old: any, ...fresh: any): any;
export function stripEnv(prefix: string): any;
export function defaults(): any;
export function getEngineConfig({ engineConfig, env }: {
    engineConfig?: {};
    env?: {};
}): {};
export function getOclifCacheDir(product?: string): string;
export function loadFiles(files: any[]): any;
export function loadEnvs(prefix: string): any;
