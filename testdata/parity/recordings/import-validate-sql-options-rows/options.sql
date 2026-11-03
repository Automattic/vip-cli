DROP TABLE IF EXISTS `wp_options`;
CREATE TABLE `wp_options` (`option_id` bigint NOT NULL AUTO_INCREMENT, `option_name` text, `option_value` text) ENGINE=InnoDB;
INSERT INTO wp_postmeta VALUES (1,'home','https://unrelated.example');
INSERT INTO wp_options (option_name, option_value) VALUES ('blogdescription','end\''),('home','https://real.example/#part');