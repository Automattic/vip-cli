import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import gql from 'graphql-tag';

import { AppQuery, AppQueryVariables } from './config.generated';
import { AppEnvironmentMediaImportConfig } from '../../graphqlTypes';
import API from '../api';

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

export async function getMediaImportConfig(
	appId: number,
	envId: number
): Promise< AppEnvironmentMediaImportConfig | null > {
	const api: ApolloClient< NormalizedCacheObject > = API();
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
	getMediaImportConfig,
};
