CREATE DATABASE automatticians;

-- for dev-env you should not switch database
USE automatticians;

INSERT INTO wp_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://super-employees-go.vip.net', 'yes'),
        ('home', 'https://super-empoyees.com', 'yes');