import debugLib from 'debug';

import { trackEventWithEnv } from '../../lib/tracker';
import { isMultiSiteInSiteMeta } from '../../lib/validations/is-multi-site';
import { sqlDumpLineIsMultiSite } from '../../lib/validations/is-multi-site-sql-dump';
import {
	isMultisitePrimaryDomainMapped,
	getPrimaryDomain,
} from '../../lib/validations/is-multisite-domain-mapped';
import { getMultilineStatement } from '../../lib/validations/utils';

import type { PostLineExecutionProcessingParams } from '../../lib/validations/line-by-line';

const debug = debugLib( 'vip:vip-import-sql' );

let isMultiSiteSqlDump = false;
let wpSiteInsertStatement: string[][];
const getWpSiteInsertStatement = getMultilineStatement( /INSERT INTO `wp_site`/s );

export const siteTypeValidations = {
	execute: ( line: string ): void => {
		const lineIsMultiSite = sqlDumpLineIsMultiSite( line );
		wpSiteInsertStatement = getWpSiteInsertStatement( line );

		if ( lineIsMultiSite ) {
			isMultiSiteSqlDump = true;
		}
	},
	postLineExecutionProcessing: async ( {
		appId,
		envId,
		searchReplace,
	}: PostLineExecutionProcessingParams ): Promise< void > => {
		const isMultiSite = await isMultiSiteInSiteMeta( appId ?? 0, envId ?? 0 );
		const track = trackEventWithEnv.bind( null, appId as number, envId as number );

		debug(
			`\nAppId: ${ appId as number } is ${ isMultiSite ? 'a multisite.' : 'not a multisite' }`
		);
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

		// Get Primary Domain
		const primaryDomainFromSQL = getPrimaryDomain( wpSiteInsertStatement, searchReplace );

		// Check if Primary Domain exists (empty string does not qualify)
		const primaryDomainExists = primaryDomainFromSQL || '' !== primaryDomainFromSQL;

		// Check if primary domain is mapped only if it exists
		// Also saves on a call to Parker by checking ahead
		if ( primaryDomainExists ) {
			const isPrimaryDomainMapped = await isMultisitePrimaryDomainMapped(
				appId ?? 0,
				envId ?? 0,
				primaryDomainFromSQL
			);

			// If site is multisite AND the primary domain is exists AND the primary is unmapped
			// then throw an error
			if ( isMultiSite && ! isPrimaryDomainMapped ) {
				await track( 'import_sql_command_error', {
					error_type: 'multisite-import-where-primary-domain-unmapped',
				} );
				throw new Error(
					"This import would set the network's main site domain to " +
						primaryDomainFromSQL +
						', however this domain is not mapped to the target environment. Please replace this domain in your ' +
						'import file, or map it to the environment.'
				);
			}
		}
	},
};
