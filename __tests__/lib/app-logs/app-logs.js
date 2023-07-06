/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from '../../../src/lib/api';
import { getRecentLogs } from '../../../src/lib/app-logs/app-logs';

jest.mock('../../../src/lib/api', () => jest.fn());

const EXPECTED_QUERY = gql`
	query GetAppLogs(
		$appId: Int
		$envId: Int
		$type: AppEnvironmentLogType
		$limit: Int
		$after: String
	) {
		app(id: $appId) {
			environments(id: $envId) {
				id
				logs(type: $type, limit: $limit, after: $after) {
					nodes {
						timestamp
						message
					}
					nextCursor
					pollingDelaySeconds
				}
			}
		}
	}
`;

describe('getRecentLogs()', () => {
	beforeEach(jest.clearAllMocks);

	it('should query the API with the correct values', async () => {
		const queryMock = jest.fn();

		API.mockImplementation(() => ({
			query: queryMock,
		}));

		queryMock.mockImplementation(() =>
			logsResponse([
				{ timestamp: '2021-11-05T20:18:36.234041811Z', message: 'My container message 1' },
				{ timestamp: '2021-11-09T20:47:07.301221112Z', message: 'My container message 2' },
			])
		);

		await getRecentLogs(1, 3, 'batch', 1200);

		expect(queryMock).toHaveBeenCalledTimes(1);
		expect(queryMock).toHaveBeenCalledWith({
			query: EXPECTED_QUERY,
			variables: {
				appId: 1,
				envId: 3,
				type: 'batch',
				limit: 1200,
				after: undefined,
			},
		});
	});

	it('should throw when logs field is not returned', () => {
		const queryMock = jest.fn();

		API.mockImplementation(() => ({
			query: queryMock,
		}));

		queryMock.mockImplementation(() => ({ data: {} }));

		const result = getRecentLogs(1, 3, 'batch', 1200);

		return expect(result).rejects.toThrow('Unable to query logs');
	});
});

function logsResponse(logs, nextCursor = null) {
	return {
		data: {
			app: {
				environments: [
					{
						logs: {
							nextCursor,
							nodes: logs,
						},
					},
				],
			},
		},
	};
}
