/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import gql from 'graphql-tag';

/**
 * Internal dependencies
 */
import API from 'lib/api';
import { trackEventWithEnv } from 'lib/tracker';
import * as exit from 'lib/cli/exit';

/**
 * Extracts the domain for site with ID 1 from an INSERT INTO `wp_site` SQL statement
 *
 * @param {array} statements An array of SQL statements
 * @returns {string} The domain
 */
export const getPrimaryDomainFromSQL = statements => {
	if ( ! statements.length ) {
		return '';
	}

	const SQL_WP_SITE_DOMAINS_REGEX = /\(1\s*,\s*'(.*?)'/s;
	const matches = statements[ 0 ]?.join( '' ).match( SQL_WP_SITE_DOMAINS_REGEX );
	return matches ? matches[ 1 ] : '';
};

/**
 * Checks whether a domain is in a list of domains
 *
 * @param {string} domainToFind The domain to look for in the list
 * @param {array} domains An array of domains mapped to the environment
 * @returns {boolean} Whether the primary domain is in the list of mapped domains
 */
const isPrimaryDomainMapped = ( domainToFind, domains ) => {
	// TODO: Should also check if the domain is found in any search-replace `to` values
	// If so, we should consider the domain mapped
	return domains.some( domain => domain === domainToFind );
};

/**
 * Gets the mapped domains and checks if the primary domain from the provided SQL dump is one of them
 *
 * @param {number} appId The ID of the app in GOOP
 * @param {number} envId The ID of the enviroment in GOOP
 * @param {array} primaryDomainFromSQL The primary domain found in the provided SQL file
 * @returns {boolean} Whether the primary domain is mapped
 */
export async function isMultisitePrimaryDomainMapped(
	appId: number,
	envId: number,
	primaryDomainFromSQL: array
): Promise< boolean > {
	const track = trackEventWithEnv.bind( null, appId, envId );

	const api = await API();
	let res;
	try {
		res = await api.query( {
			query: gql`
				query AppMappedDomains($appId: Int, $envId: Int) {
					app(id: $appId) {
						id
						name
						environments(id: $envId) {
							uniqueLabel
							isMultisite
							domains {
								nodes {
									name
									isPrimary
								}
							}
						}
					}
				}
			`,
			variables: {
				appId,
				envId,
			},
		} );
	} catch ( GraphQlError ) {
		await track( 'import_sql_command_error', {
			error_type: 'GraphQL-MappedDomain-Check-failed',
			gql_err: GraphQlError,
		} );
		exit.withError( `StartImport call failed: ${ GraphQlError }` );
	}

	if ( ! Array.isArray( res?.data?.app?.environments ) ) {
		return false;
	}

	const environments = res.data.app.environments;
	if ( ! environments.length ) {
		return false;
	}

	const mappedDomains = environments[ 0 ]?.domains?.nodes?.map( domain => domain.name );
	return isPrimaryDomainMapped( primaryDomainFromSQL, mappedDomains );
}
