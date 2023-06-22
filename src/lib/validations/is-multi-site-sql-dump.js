// @flow
// @format

const SQL_CREATE_TABLE_IS_MULTISITE_REGEX = /^CREATE TABLE `?(wp_\d+_[a-z0-9_]*|wp_blogs)/i;
const SQL_CONTAINS_MULTISITE_WP_USERS_REGEX = /`spam` tinyint\(2\)|`deleted` tinyint\(2\)/i;

export function sqlDumpLineIsMultiSite( line: string ): boolean {
	// determine if we're on a CREATE TABLE statement line what has eg. wp_\d_options OR wp_blogs
	// also check if we're on a line that defines the additional two columns found on the wp_users table for multisites
	return (
		SQL_CREATE_TABLE_IS_MULTISITE_REGEX.test( line ) ||
		SQL_CONTAINS_MULTISITE_WP_USERS_REGEX.test( line )
	);
}
