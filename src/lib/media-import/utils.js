import fs from 'fs';

export function isLocalArchive( filePath ) {
	if ( typeof filePath !== 'string' || filePath.length === 0 ) {
		return false;
	}

	const lower = filePath.toLowerCase();
	const isArchive =
		lower.endsWith( '.tar.gz' ) || lower.endsWith( '.tgz' ) || lower.endsWith( '.zip' );
	if ( ! isArchive ) {
		return false;
	}

	try {
		return fs.existsSync( filePath ) && fs.statSync( filePath ).isFile();
	} catch {
		return false;
	}
}

export default {
	isLocalArchive,
};
