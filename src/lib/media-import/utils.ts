import { stat } from 'node:fs/promises';

export async function isLocalArchive( filePath: string ): Promise< boolean > {
	const lower = filePath.toLowerCase();
	const isArchive =
		lower.endsWith( '.tar.gz' ) || lower.endsWith( '.tgz' ) || lower.endsWith( '.zip' );
	if ( ! isArchive ) {
		return false;
	}

	try {
		const fileStat = await stat( filePath );
		return fileStat.isFile();
	} catch {
		return false;
	}
}
