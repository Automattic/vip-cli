DROP TABLE IF EXISTS `wp_options`;
CREATE TABLE `wp_options` (`option_id` bigint NOT NULL AUTO_INCREMENT, `option_name` text, `option_value` text) ENGINE=InnoDB;
INSERT INTO wp_postmeta VALUES (1,'home','https://unrelated.example');
INSERT INTO wp_options (option_name, option_value) VALUES ('blogdescription','end\''),('home','https://real.example/#part');
INSERT INTO wp_options (option_name, option_value) VALUES ('blogdescription','first
# literal /* text */
INSERT INTO wp_posts is text'), ('home', 'https://multiline.example/#part');
INSERT INTO wp_options (option_name, option_value) VALUES ('blogdescription','ok') ON DUPLICATE KEY UPDATE
option_value = CONCAT('home','https://clause.example');
