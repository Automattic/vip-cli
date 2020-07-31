/**
 * @flow
 * @format
 */

/**
 * Internal dependencies
 */
import API from 'lib/api';

export async function getUploadURL( organizationId: number, appId: number, objectBaseName: string ): Promise<any> {
	const { apiFetch } = await API();
	return apiFetch( '/upload/signed-url', {
		method: 'POST',
		body: { path: `/${ objectBaseName }` },
	} );
}

export default { getUploadURL };
