/**
 * Get SQL statements matching a supplied pattern from a file stream
 *
 * @param {RegExp} statementRegex A RegExp pattern representing the start of the statement to capture
 * @returns {function} A function which processes individual lines to capture the matching statements
 */
export function getMultilineStatement( statementRegex ) {
	const matchingStatements = [];
	let isCapturing = false;
	let index = 0;

	/**
	 * Processes each line of the file stream and builds an array of statements which start with the supplied pattern
	 *
	 * @param {string} line A line from the file stream
	 * @returns {array} An array of matching statements where each statement is presented as an array of lines
	 */
	return line => {
		const shouldStartCapture = statementRegex.test( line );
		const shouldEndCapture = isCapturing && /;$/.test( line );
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
