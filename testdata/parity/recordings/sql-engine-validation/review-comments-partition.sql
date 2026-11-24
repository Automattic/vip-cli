DROP TABLE IF EXISTS `wp_posts`;
CREATE TABLE `wp_posts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `description` varchar(100) DEFAULT ' ENGINE=MyISAM',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
INSERT INTO wp_posts VALUES (1,' engine = MyISAM');
ALTER TABLE wp_posts PARTITION BY HASH(id) (PARTITION p0 ENGINE=MyISAM);
ALTER TABLE db.wp_posts PARTITION BY HASH(id) (PARTITION engine ENGINE=Aria);
