import App from 'lando/lib/app';

export interface AppInfo extends Record< string, unknown > {
	name: string;
	location: string;
	services: string;
}

export function getHostPath( mount: any ): any;
export function getUrls(
	data: any,
	scan?: string[],
	secured?: string[],
	bindAddress?: string
): any;
export function normalizePath( local: any, base?: string, excludes?: any[] ): any;
export function normalizeOverrides( overrides: any, base?: string, volumes?: {} ): any;
export function startTable( app: App ): AppInfo;
export function stripPatch( version: any ): any;
export function stripWild( versions: any ): any;
