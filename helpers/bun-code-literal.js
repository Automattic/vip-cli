// Serialize a JavaScript string literal, including characters unsafe in code embeds.
function javascriptString( value ) {
	return JSON.stringify( value ).replace(
		/[<>\u2028\u2029]/g,
		character => String.raw`\u${ character.codePointAt( 0 ).toString( 16 ).padStart( 4, '0' ) }`
	);
}

module.exports = { javascriptString };
