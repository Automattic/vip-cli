-- Dangerous-statement fixture: DROP DATABASE is flagged by sql.ts's
-- `dropDB` check (line 271). Includes the required DROP TABLE +
-- CREATE TABLE so those checks don't double-fault on missing-statement
-- errors; this scenario is about asserting the dangerous-finding wording
-- surfaces, not about clean-vs-dirty.
DROP TABLE IF EXISTS `wp_options`;
CREATE TABLE `wp_options` (
  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
DROP DATABASE foo;
