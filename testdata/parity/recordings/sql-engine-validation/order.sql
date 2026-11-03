DROP TABLE IF EXISTS `wp_posts`;
CREATE TABLE `wp_posts` (`id` bigint NOT NULL AUTO_INCREMENT, `engine` INT, PRIMARY KEY (`id`)) ENGINE=InnoDB;
ALTER TABLE wp_posts ORDER BY id, engine DESC;
