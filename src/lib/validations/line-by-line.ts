import debugLib from 'debug';
import { once } from 'node:events';
import { open } from 'node:fs/promises';

import * as exit from '../../lib/cli/exit';

const debug = debugLib( 'vip:validations:line-by-line' );
export interface PerLineValidationObject {
	execute: ( line: string ) => unknown;
	postLineExecutionProcessing?: ( params: PostLineExecutionProcessingParams ) => Promise< unknown >;
}

export interface PostLineExecutionProcessingParams {
	appId?: number;
	envId?: number;
	fileName?: string;
	isImport?: boolean;
	skipChecks?: string[];
	searchReplace?: string | string[];
}

export async function getReadInterface(
	filename: string
): Promise< ReturnType< Awaited< ReturnType< typeof open > >[ 'readLines' ] > > {
	let fd;
	try {
		fd = await open( filename );
	} catch {
		exit.withError(
			'The file at the provided path is either missing or not readable. Please check the input and try again.'
		);
	}

	return fd.readLines( {
		encoding: 'binary',
	} );
}

export async function fileLineValidations(
	appId: number,
	envId: number,
	fileName: string,
	validations: PerLineValidationObject[],
	searchReplace: string | string[]
) {
	const isImport = true;
	const readInterface = await getReadInterface( fileName );

	debug( 'Validations: ', validations );

	readInterface.on( 'line', line => {
		validations.forEach( validation => {
			validation.execute( line );
		} );
	} );

	readInterface.on( 'error', ( err: Error ) => {
		throw new Error( `Error validating input file: ${ err.toString() }`, { cause: err } );
	} );

	// Block until the processing completes
	await once( readInterface, 'close' );

	return Promise.all(
		validations.map( ( validation: PerLineValidationObject ) => {
			if (
				Object.hasOwn( validation, 'postLineExecutionProcessing' ) &&
				typeof validation.postLineExecutionProcessing === 'function'
			) {
				return validation.postLineExecutionProcessing( {
					fileName,
					isImport,
					appId,
					envId,
					searchReplace,
				} );
			}

			return Promise.resolve();
		} )
	);
}
