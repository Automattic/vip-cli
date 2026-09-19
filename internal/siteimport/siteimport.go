// Package siteimport ports src/lib/site-import/** plus the site-type /
// multisite-domain validations that gate `vip import sql`.
package siteimport

const gbInBytes = int64(1024 * 1024 * 1024)

// Node src/lib/site-import/db-file-import.ts:5-6.
const (
	SQLImportFileSizeLimit         = 200 * gbInBytes
	SQLImportFileSizeLimitLaunched = 10 * gbInBytes
)

// databaseApplicationTypeIDs — src/lib/constants/vipgo.ts:19
// [WORDPRESS=2, WORDPRESS_NON_PROD=6, NODEJS_MYSQL=5, NODEJS_MYSQL_REDIS=8].
var databaseApplicationTypeIDs = map[int64]bool{2: true, 6: true, 5: true, 8: true}

// IsSupportedApp ports isSupportedApp (db-file-import.ts:25).
func IsSupportedApp(typeID int64) bool { return databaseApplicationTypeIDs[typeID] }
