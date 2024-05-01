import gql from 'graphql-tag';

import { AppMultiSiteCheckQuery, AppMultiSiteCheckQueryVariables } from './is-multi-site.generated';
import { App, AppEnvironment } from '../../graphqlTypes';
import API from '../../lib/api';
import * as exit from '../../lib/cli/exit';
import { trackEventWithEnv } from '../../lib/tracker';

const isMultiSite = new WeakMap< Record< string, number >, boolean >();

export async function isMultiSiteInSiteMeta( appId: number, envId: number ): Promise< boolean > {
	const args = {
		0: appId,
		1: envId,
	};

	// if we've already been through this, avoid doing it again within the same process
	const ret = isMultiSite.get( args );
	if ( 'boolean' === typeof ret ) {
		return ret;
	}

	const api = API();
	let res;
	try {
		res = await api.query< AppMultiSiteCheckQuery, AppMultiSiteCheckQueryVariables >( {
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
		const track = trackEventWithEnv.bind( null, appId, envId );
		await track( 'import_sql_command_error', {
			error_type: 'GraphQL-MultiSite-Check-failed',
			gql_err: GraphQlError,
		} );
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		exit.withError( `StartImport call failed: ${ GraphQlError }` );
	}

	if ( Array.isArray( res.data.app?.environments ) ) {
		const environments = ( res.data.app as App ).environments;
		if ( ! environments?.length ) {
			isMultiSite.set( args, false );
			return false;
		}
		// we asked for one result with one appId and one envId, so...
		const thisEnv = environments[ 0 ] as AppEnvironment;
		if ( thisEnv.isMultisite || thisEnv.isSubdirectoryMultisite ) {
			isMultiSite.set( args, true );
			return true;
		}
	}

	return false;
}
