import { ApolloClient, ApolloQueryResult, NormalizedCacheObject } from '@apollo/client';
import gql from 'graphql-tag';

import { MediaImportConfig } from '../../graphqlTypes';
import API from '../api';

const IMPORT_MEDIA_CONFIG_QUERY = gql`
	{
		mediaImportConfig {
			fileNameCharCount
			fileSizeLimitInBytes
			allowedFileTypes
		}
	}
`;

export async function getMediaImportConfig(): Promise< unknown > {
	const api: ApolloClient< NormalizedCacheObject > = API();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response: ApolloQueryResult< any > = await api.query( {
		query: IMPORT_MEDIA_CONFIG_QUERY,
		variables: {},
		fetchPolicy: 'network-only',
	} );

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	if ( ! response.data?.mediaImportConfig?.length ) {
		return null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return
	return response.data?.mediaImportConfig as unknown as MediaImportConfig;
}
