import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import gql from 'graphql-tag';

import { AppQuery, AppQueryVariables } from './status.generated';
import { AppEnvironmentMediaImportConfig } from '../../graphqlTypes';

const IMPORT_MEDIA_CONFIG_QUERY = gql`
	query App($appId: Int, $envId: Int) {
		app(id: $appId) {
			environments(id: $envId) {
				mediaImportConfig {
					fileNameCharCount
					fileSizeLimitInBytes
					allowedFileTypes
				}
			}
		}
	}
`;

export async function mediaImportGetConfig(
	api: ApolloClient< NormalizedCacheObject >,
	appId: number,
	envId: number
): Promise< AppEnvironmentMediaImportConfig | null > {
	const response = await api.query< AppQuery, AppQueryVariables >( {
		query: IMPORT_MEDIA_CONFIG_QUERY,
		variables: { appId, envId },
		fetchPolicy: 'network-only',
	} );

	const environments = response.data.app?.environments;

	if ( ! environments?.length ) {
		throw new Error( 'Unable to determine configuration' );
	}
	const [ environment ] = environments;
	const { mediaImportConfig } = environment ?? {};

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return mediaImportConfig ?? null;
}

export default {
	mediaImportGetConfig,
};
