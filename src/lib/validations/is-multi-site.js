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

let isMultiSite;

export async function isMultiSiteInSiteMeta( appId: number, envId: number ): Promise<boolean> {
	const track = trackEventWithEnv.bind( null, appId, envId );

	// if we've already been through this, avoid doing it again within the same process
	if ( 'boolean' === typeof isMultiSite ) {
		return isMultiSite;
	}

	const api = await API();
	let res;
	try {
		res = await api.query( {
			query: gql`
				query AppMultiSiteCheck($appId: Int, $envId: Int) {
					app(id: $appId) {
						id
						name
						repo
						environments(id: $envId) {
							id
							appId
							name
							type
							isMultisite
							isSubdirectoryMultisite
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
			error_type: 'GraphQL-MultiSite-Check-failed',
			gql_err: GraphQlError,
		} );
		exit.withError( `StartImport call failed: ${ GraphQlError }` );
	}

	if ( Array.isArray( res?.data?.app?.environments ) ) {
		const environments = res.data.app.environments;
		if ( ! environments.length ) {
			isMultiSite = false;
			return isMultiSite;
		}
		// we asked for one result with one appId and one envId, so...
		const thisEnv = environments[ 0 ];
		if ( thisEnv.isMultiSite || thisEnv.isSubdirectoryMultisite ) {
			isMultiSite = true;
			return isMultiSite;
		}
	}

	// we should exit with an error here instead of returning false
	exit.withError( 'We were unable to determine if your application was a multisite.' );
	return false;
}
