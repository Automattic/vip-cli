import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { doesEnvironmentExist, getEnvironmentPath } from './dev-environment-core';
import { DEV_ENVIRONMENT_NOT_FOUND } from '../constants/dev-environment';

export function preparseEnvData( data: string ): string[] {
	return data
		.split( /\r?\n/ )
		.map( line => line.trim() )
		.filter( line => line && ! line.startsWith( '#' ) );
}

export function parseEnvValue( value: string ): string {
	if ( value.startsWith( '"' ) && value.endsWith( '"' ) ) {
		return value.slice( 1, -1 ).replace( /\\(["$\\nrt])/g, ( match, char: string ) => {
			switch ( char ) {
				case '"':
				case '$':
				case '\\':
					return char;
				case 'n':
					return '\n';
				case 'r':
					return '\r';
				case 't':
					return '\t';
				default:
					return match;
			}
		} );
	}

	if ( value.startsWith( "'" ) && value.endsWith( "'" ) ) {
		return value.slice( 1, -1 ).replace( /\\'/g, "'" );
	}

	return value;
}

export function quoteEnvValue( value: string ): string {
	return `"${ value.replace( /[\\"$\n\r\t]/g, match => {
		switch ( match ) {
			case '\\':
			case '"':
			case '$':
				return '\\' + match;
			case '\n':
				return '\\n';
			case '\r':
				return '\\r';
			case '\t':
				return '\\t';
			default:
				return match;
		}
	} ) }"`;
}

export async function getEnvFilePath( slug: string, checkEnvExists = true ): Promise< string > {
	const environmentPath = getEnvironmentPath( slug );
	if ( checkEnvExists && ! ( await doesEnvironmentExist( environmentPath ) ) ) {
		throw new Error( DEV_ENVIRONMENT_NOT_FOUND );
	}

	return join( environmentPath, '.env' );
}

export async function readEnvFile( slug: string ): Promise< string[] > {
	const name = await getEnvFilePath( slug );
	const content = await readFile( name, 'utf-8' );
	return preparseEnvData( content );
}

export async function updateEnvFile( slug: string, content: string ): Promise< void > {
	const name = await getEnvFilePath( slug, false );
	await writeFile( `${ name }.tmp`, content, 'utf-8' );
	await rename( `${ name }.tmp`, name );
}
