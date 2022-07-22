/**
 * @flow
 * @format
 */

/**
 * External dependencies
 */
import debugLib from 'debug';

/**
 * Internal dependencies
 */
import { trackEventWithEnv } from 'lib/tracker';
import { sqlDumpLineIsMultiSite } from 'lib/validations/is-multi-site-sql-dump';
import { isMultiSiteInSiteMeta } from 'lib/validations/is-multi-site';
import {
	isMultisitePrimaryDomainMapped,
	getPrimaryDomainFromSQL,
} from 'lib/validations/is-multisite-domain-mapped';
import { getMultilineStatement } from 'lib/validations/utils';
import type { PostLineExecutionProcessingParams } from 'lib/validations/line-by-line';

const debug = debugLib( 'vip:vip-import-sql' );

let isMultiSiteSqlDump = false;
let wpSiteInsertStatement;
const getWpSiteInsertStatement = getMultilineStatement( /INSERT INTO `wp_site`/s );

export const siteTypeValidations = {
	execute: ( line: string ) => {
		const lineIsMultiSite = sqlDumpLineIsMultiSite( line );
		wpSiteInsertStatement = getWpSiteInsertStatement( line );

		if ( lineIsMultiSite ) {
			isMultiSiteSqlDump = true;
		}
	},
	postLineExecutionProcessing: async ( { appId, envId }: PostLineExecutionProcessingParams ) => {
		const isMultiSite = await isMultiSiteInSiteMeta( appId, envId );
		const primaryDomainFromSQL = getPrimaryDomainFromSQL( wpSiteInsertStatement );
		const isPrimaryDomainMapped =
			primaryDomainFromSQL &&
			( await isMultisitePrimaryDomainMapped( appId, envId, primaryDomainFromSQL ) );
		const track = trackEventWithEnv.bind( null, appId, envId );

		debug( `\nAppId: ${ appId } is ${ isMultiSite ? 'a multisite.' : 'not a multisite' }` );
		debug(
			`The SQL dump provided is ${
				isMultiSiteSqlDump ? 'from a multisite.' : 'not from a multisite'
			}\n`
		);

		if ( ! isMultiSite && isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', {
				error_type: 'not-multisite-with-multisite-sql-dump',
			} );
			throw new Error(
				'You have provided a multisite SQL dump file for import into a single site (non-multisite).'
			);
		}

		if ( isMultiSite && ! isMultiSiteSqlDump ) {
			await track( 'import_sql_command_error', {
				error_type: 'subsite-import-without-subsite-sql-dump',
			} );
			throw new Error(
				'You have requested a subsite SQL import but have not provided a subsite compatiable SQL dump.'
			);
		}

		if ( isMultiSite && ! isPrimaryDomainMapped ) {
			await track( 'import_sql_command_error', {
				error_type: 'multisite-import-where-primary-domain-unmapped',
			} );
			throw new Error(
				`The SQL dump provided would set the network's main site domain to ${ primaryDomainFromSQL }, however this domain is not mapped to the target environment.`
			);
		}
	},
};
