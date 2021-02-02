/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { trackEventWithEnv } from 'lib/tracker';
import { sqlDumpLineIsMultiSite } from 'lib/validations/is-multi-site-sql-dump';
import { isMultiSiteInSiteMeta } from 'lib/validations/is-multi-site';
import * as exit from 'lib/cli/exit';
import type { PostLineExecutionProcessingParams } from 'lib/validations/line-by-line';
import debugLib from 'debug';

const debug = debugLib( 'vip:vip-import-sql' );

let isMultiSiteSqlDump = false;

export const siteTypeValidations = {
	execute: ( line: string ) => {
		const lineIsMultiSite = sqlDumpLineIsMultiSite( line );
		if ( lineIsMultiSite ) {
			isMultiSiteSqlDump = true;
		}
	},
	postLineExecutionProcessing: async ( { appId, envId }: PostLineExecutionProcessingParams ) => {
		const isMultiSite = await isMultiSiteInSiteMeta( appId, envId );
		const track = trackEventWithEnv.bind( null, appId, envId );

		debug( `\nAppId: ${ appId } is ${ isMultiSite ? 'a multisite.' : 'not a multisite' }` );
		debug( `The SQL dump provided is ${ isMultiSiteSqlDump ? 'from a multisite.' : 'not from a multisite' }\n` );

		// if site is a multisite but import sql is not
		if ( isMultiSite && ! isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', { error_type: 'multisite-but-not-multisite-sql-dump' } );

			throw new Error( 'You have provided a non-multisite SQL dump file for import into a multisite.' );
		}

		// if site is a single site but import sql is for a multi site
		if ( ! isMultiSite && isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', { error_type: 'not-multisite-with-multisite-sql-dump' } );

			throw new Error( 'You have provided a multisite SQL dump file for import into a single site (non-multisite).' );
		}
	},
};
