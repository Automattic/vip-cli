-- WP multisite dump fixture: the wp_2_options table triggers the
-- multi-site CREATE-TABLE detection in is-multi-site-sql-dump.ts.
DROP TABLE IF EXISTS `wp_options`;
CREATE TABLE `wp_options` (
  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
DROP TABLE IF EXISTS `wp_2_options`;
CREATE TABLE `wp_2_options` (
  `option_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
