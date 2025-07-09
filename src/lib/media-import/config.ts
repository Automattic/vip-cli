import gql from 'graphql-tag';

import API from '../api';

import type { MediaImportConfigQuery } from './config.generated';
import type { MediaImportConfig } from '../../graphqlTypes';

const IMPORT_MEDIA_CONFIG_QUERY = gql`
	query MediaImportConfig {
		mediaImportConfig {
			fileNameCharCount
			fileSizeLimitInBytes
			allowedFileTypes
		}
	}
`;

export async function getMediaImportConfig(): Promise< MediaImportConfig | null > {
	const api = API();

	const response = await api.query< MediaImportConfigQuery >( {
		query: IMPORT_MEDIA_CONFIG_QUERY,
		variables: {},
		fetchPolicy: 'network-only',
	} );

	return response?.data?.mediaImportConfig ?? null;
}
