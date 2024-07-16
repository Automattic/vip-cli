import gql from 'graphql-tag';

import { MediaImportConfigQuery } from './config.generated';
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

export async function getMediaImportConfig(): Promise< MediaImportConfig | null > {
	const api = API();

	const response = await api.query< MediaImportConfigQuery >( {
		query: IMPORT_MEDIA_CONFIG_QUERY,
		variables: {},
		fetchPolicy: 'network-only',
	} );

	return response?.data?.mediaImportConfig as unknown as MediaImportConfig | null;
}
