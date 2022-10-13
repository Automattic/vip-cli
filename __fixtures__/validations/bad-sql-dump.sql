CREATE DATABASE automatticians;

USE automatticians;

-- DROP TABLE IF EXISTS `employees`;

-- CREATE TABLE `employees` (
--     id INT(10) UNSIGNED NOT NULL AUTO_INCREMENTS,
--     employeeNumber VARCHAR(255) NOT NULL,
--     firstName VARCHAR(255) NOT NULL,
--     lastName VARCHAR(255) NOT NULL,
--     PRIMARY KEY (id),
--     UNIQUE KEY (employeeNumber)
-- ) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TRIGGER before_employee_update
        BEFORE UPDATE ON employees
        FOR EACH ROW
    INSERT INTO employee_audit
    SET action = 'update',
        employeeNumber = OLD.employeeNumber,
        lastname = OLD.lastname,
        changedat = NOW();

ALTER USER USER() IDENTIFIED BY 'auth_string';

DROP DATABASE countrycodes;

INSERT INTO wp_options (option_name, option_value, autoload) 
    VALUES 
        ('siteurl', 'https://super-employees-go.vip.net', 'yes'),
        ('home', 'https://super-empoyees.com', 'yes');

SET @@SESSION.SQL_LOG_BIN= 0;

ALTER TABLE wp_options
	ADD PRIMARY KEY (`option_id`),
	ADD UNIQUE KEY `option_name` (`option_name`),
	ADD KEY `autoload` (`autoload`);

SET UNIQUE_CHECKS = 0;
