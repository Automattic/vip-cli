DROP TABLE IF EXISTS `wp_a8c_cron_control_jobs`;

CREATE TABLE `wp_a8c_cron_control_jobs` (
  `ID` bigint unsigned ,
  `timestamp` bigint unsigned NOT NULL,
  `action` varchar(255) NOT NULL,
  `action_hashed` varchar(32) NOT NULL,
  `instance` varchar(32) NOT NULL,
  `args` longtext NOT NULL,
  `schedule` varchar(255) DEFAULT NULL,
  `interval` int unsigned DEFAULT '0',
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `created` datetime NOT NULL,
  `last_modified` datetime NOT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `ts_action_instance_status` (`timestamp`,`action`(191),`instance`,`status`),
  KEY `status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;