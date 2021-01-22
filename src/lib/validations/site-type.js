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

let isMultiSiteSqlDump = false;

export const siteTypeValidations = {
	execute: ( line: string ) => {
		const lineIsMultiSite = sqlDumpLineIsMultiSite( line );
		if ( lineIsMultiSite ) {
			isMultiSiteSqlDump = true;
		}
	},
	postLineExecutionProcessing: async ( { appId, envId } ) => {
		const isMultiSite = await isMultiSiteInSiteMeta( appId, envId );
		const track = trackEventWithEnv.bind( null, appId, envId );

		console.log( `\nAppId: ${ appId } is ${ isMultiSite ? 'a multisite.' : 'not a multisite' }` );
		console.log( `The SQL dump provided is ${ isMultiSiteSqlDump ? 'from a multisite.' : 'not from a multisite' }\n` );

		// if site is a multisite but import sql is not
		if ( isMultiSite && ! isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', { error_type: 'multisite-but-not-multisite-sql-dump' } );
			exit.withError( 'You have provided a non-multisite SQL dump file for import into a multisite.' );
		}

		// if site is a single site but import sql is for a multi site
		if ( ! isMultiSite && isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', { error_type: 'not-multisite-with-multisite-sql-dump' } );
			exit.withError( 'You have provided a multisite SQL dump file for import into a single site (non-multisite).' );
		}
	},
};
