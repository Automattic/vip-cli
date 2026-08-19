import fs from 'node:fs';
import path from 'node:path';

import UserError from '../user-error';
import { hasTerminalControlCharacters } from './output';
import { EDGE_WORKER_LOCATION_OPERATORS, SUPPORTED_EDGE_WORKER_TYPES } from './types';

import type {
	EdgeWorkerLocation,
	EdgeWorkerLocationOperator,
	EdgeWorkerOnFailure,
	EdgeWorkerType,
	ProjectDescriptor,
	WorkerManifest,
} from './types';

// eslint-disable-next-line security/detect-unsafe-regex
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
// This range deliberately rejects every Windows-disallowed control character.
// eslint-disable-next-line no-control-regex
const INVALID_PATH_CHARACTER = /[<>:"/\\|?*\u0000-\u001f]/;

export function validateWorkerName( name: unknown, label = 'worker name' ): string {
	if (
		typeof name !== 'string' ||
		name.length === 0 ||
		name.length > 64 ||
		name === '.' ||
		name === '..' ||
		INVALID_PATH_CHARACTER.test( name ) ||
		/[. ]$/.test( name ) ||
		WINDOWS_RESERVED_NAME.test( name )
	) {
		throw new UserError( `Invalid ${ label } "${ String( name ) }".` );
	}
	return name;
}

export function resolvePathWithin( root: string, relativePath: string, label: string ): string {
	if (
		typeof relativePath !== 'string' ||
		relativePath.length === 0 ||
		path.isAbsolute( relativePath )
	) {
		throw new UserError( `${ label } must be a non-empty relative path.` );
	}
	const resolvedRoot = path.resolve( root );
	const resolvedPath = path.resolve( resolvedRoot, relativePath );
	const relative = path.relative( resolvedRoot, resolvedPath );
	if (
		relative === '..' ||
		relative.startsWith( `..${ path.sep }` ) ||
		path.isAbsolute( relative )
	) {
		throw new UserError( `${ label } must stay within "${ resolvedRoot }".` );
	}
	return resolvedPath;
}

function isPathWithin( root: string, candidate: string ): boolean {
	const relative = path.relative( root, candidate );
	return (
		relative === '' ||
		( relative !== '..' &&
			! relative.startsWith( `..${ path.sep }` ) &&
			! path.isAbsolute( relative ) )
	);
}

function realpath( target: string, label: string ): string {
	try {
		return fs.realpathSync.native( target );
	} catch {
		throw new UserError( `${ label } could not be resolved at "${ target }".` );
	}
}

function lstatIfExists( target: string ): fs.Stats | undefined {
	try {
		return fs.lstatSync( target );
	} catch ( error ) {
		if ( ( error as NodeJS.ErrnoException ).code === 'ENOENT' ) {
			return undefined;
		}
		throw error;
	}
}

/** Resolve an existing input and require its canonical target to remain below the canonical root. */
export function resolveExistingPathWithin(
	root: string,
	relativePath: string,
	label: string
): string {
	const resolvedPath = resolvePathWithin( root, relativePath, label );
	const canonicalRoot = realpath( path.resolve( root ), `${ label } root` );
	const canonicalPath = realpath( resolvedPath, label );

	if ( ! isPathWithin( canonicalRoot, canonicalPath ) ) {
		throw new UserError( `${ label } must stay within "${ canonicalRoot }".` );
	}

	return canonicalPath;
}

/**
 * Prepare an output path below an existing root. Existing parent components and
 * the output itself must not be symlinks. Missing parents are created one at a
 * time and then canonicalized below the root before the path is returned.
 */
export function resolveOutputPathWithin(
	root: string,
	relativePath: string,
	label: string,
	directoryLabel: string
): string {
	const resolvedRoot = path.resolve( root );
	const resolvedPath = resolvePathWithin( resolvedRoot, relativePath, label );
	const canonicalRoot = realpath( resolvedRoot, `${ label } root` );
	const relativeParent = path.relative( resolvedRoot, path.dirname( resolvedPath ) );
	const components = relativeParent === '' ? [] : relativeParent.split( path.sep );
	let current = resolvedRoot;

	for ( const component of components ) {
		current = path.join( current, component );
		const stat = lstatIfExists( current );
		if ( stat ) {
			if ( stat.isSymbolicLink() ) {
				throw new UserError( `${ directoryLabel } must not be a symbolic link.` );
			}
			if ( ! stat.isDirectory() ) {
				throw new UserError( `${ directoryLabel } must be a directory.` );
			}
		} else {
			fs.mkdirSync( current );
		}

		const canonicalDirectory = realpath( current, directoryLabel );
		if ( ! isPathWithin( canonicalRoot, canonicalDirectory ) ) {
			throw new UserError( `${ directoryLabel } must stay within "${ canonicalRoot }".` );
		}
	}

	const canonicalParent = realpath( path.dirname( resolvedPath ), directoryLabel );
	const outputPath = path.join( canonicalParent, path.basename( resolvedPath ) );
	const outputStat = lstatIfExists( outputPath );
	if ( outputStat ) {
		if ( outputStat.isSymbolicLink() ) {
			throw new UserError( `${ label } must not be a symbolic link.` );
		}
		if ( ! outputStat.isFile() ) {
			throw new UserError( `${ label } must be a regular file.` );
		}
		const canonicalOutput = realpath( outputPath, label );
		if ( ! isPathWithin( canonicalRoot, canonicalOutput ) ) {
			throw new UserError( `${ label } must stay within "${ canonicalRoot }".` );
		}
	}

	return outputPath;
}

function isPlainObject( value: unknown ): value is Record< string, unknown > {
	return typeof value === 'object' && value !== null && ! Array.isArray( value );
}

export function parseProjectDescriptor( value: unknown, file: string ): ProjectDescriptor {
	if ( ! isPlainObject( value ) ) {
		throw new UserError( `Project descriptor at "${ file }" has an invalid "type" field.` );
	}
	if ( value.type === undefined ) {
		throw new UserError( `Project descriptor at "${ file }" is missing a "type" field.` );
	}
	if ( ! SUPPORTED_EDGE_WORKER_TYPES.includes( value.type as EdgeWorkerType ) ) {
		throw new UserError( `Project descriptor at "${ file }" has an invalid "type" field.` );
	}
	if ( value.sdk !== undefined && typeof value.sdk !== 'string' ) {
		throw new UserError( `Project descriptor at "${ file }" has an invalid "sdk" field.` );
	}

	const descriptor: ProjectDescriptor = { type: value.type as EdgeWorkerType };
	if ( value.sdk !== undefined ) {
		descriptor.sdk = value.sdk;
	}
	return descriptor;
}

function parseLocation( value: unknown, file: string ): EdgeWorkerLocation | null | undefined {
	if ( value === undefined || value === null ) {
		return value;
	}
	if ( ! isPlainObject( value ) ) {
		throw new UserError( `Worker manifest at "${ file }" has an invalid location.` );
	}
	if ( ! EDGE_WORKER_LOCATION_OPERATORS.includes( value.operator as EdgeWorkerLocationOperator ) ) {
		throw new UserError( `Worker manifest at "${ file }" has an invalid location operator.` );
	}
	if (
		typeof value.value !== 'string' ||
		value.value.length === 0 ||
		hasTerminalControlCharacters( value.value )
	) {
		throw new UserError( `Worker manifest at "${ file }" has an invalid location value.` );
	}
	return { operator: value.operator as EdgeWorkerLocationOperator, value: value.value };
}

export function parseWorkerManifest( value: unknown, file: string ): WorkerManifest {
	if ( ! isPlainObject( value ) ) {
		throw new UserError( `Worker manifest at "${ file }" must be an object.` );
	}

	const name = validateWorkerName( value.name, 'worker name' );
	if ( typeof value.entry !== 'string' || value.entry.length === 0 ) {
		throw new UserError( `Worker manifest at "${ file }" is missing an "entry" field.` );
	}
	resolvePathWithin( path.dirname( file ), value.entry, 'Worker entry' );
	if (
		value.on_failure !== undefined &&
		value.on_failure !== 'continue' &&
		value.on_failure !== 'error'
	) {
		throw new UserError( `Worker manifest at "${ file }" has an invalid "on_failure" field.` );
	}

	const manifest: WorkerManifest = { name, entry: value.entry };
	const location = parseLocation( value.location, file );
	if ( location !== undefined ) {
		manifest.location = location;
	}
	if ( value.on_failure !== undefined ) {
		manifest.on_failure = value.on_failure as EdgeWorkerOnFailure;
	}
	return manifest;
}
