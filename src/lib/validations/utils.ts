import { execFileSync } from 'child_process';

/**
 * Get SQL statements matching a supplied pattern from a file stream
 *
 * @param {RegExp} statementRegex A RegExp pattern representing the start of the statement to capture
 * @return {Function} A function which processes individual lines to capture the matching statements
 */
export function getMultilineStatement( statementRegex: RegExp ): ( line: string ) => string[][] {
	const matchingStatements: string[][] = [];
	let isCapturing = false;
	let index = 0;

	/**
	 * Processes each line of the file stream and builds an array of statements which start with the supplied pattern
	 *
	 * @param {string} line A line from the file stream
	 * @return {Array} An array of matching statements where each statement is presented as an array of lines
	 */
	return ( line: string ): string[][] => {
		const shouldStartCapture = statementRegex.test( line );
		const shouldEndCapture = ( shouldStartCapture || isCapturing ) && line.endsWith( ';' );
		if ( shouldStartCapture ) {
			isCapturing = true;
			matchingStatements[ index ] = [];
		}

		if ( isCapturing ) {
			matchingStatements[ index ].push( line );
		}

		if ( shouldEndCapture ) {
			isCapturing = false;
			index++;
		}

		return matchingStatements;
	};
}

export function getFileType( filepath: string ): string {
	const regex = new RegExp( /^\w+\/[-+.\w]+/g );

	let errMsg: string;
	try {
		const result = execFileSync( '/usr/bin/file', [ '-b', '--mime-type', filepath ] );

		// execFileSync returns a Buffer so we need to convert it to a string
		const resultStr = result.toString().trim();

		// If it doesn't look like a MIME type string than it's probably an error
		if ( ! regex.test( resultStr ) ) {
			errMsg = `Error encountered while trying to find mime type for ${ filepath }: ${ resultStr }`;
			throw new Error( errMsg );
		}

		return resultStr;
	} catch ( err ) {
		errMsg = `Failed to run command to find mime type for ${ filepath }: ${ err as string }`;
		throw new Error( errMsg );
	}
}
