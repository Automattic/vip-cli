CREATE DATABASE automatticians;

-- for dev-env you should not switch database
USE automatticians;

INSERT INTO wp_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://super-employees-go.vip.net', 'yes'),
        ('home', 'https://super-empoyees.com', 'yes'),
        ('home', 'home', 'yes'),
        ('blogdescription', 'legacy snippet: \'home\', \'https://embedded.example\'', 'yes');

INSERT INTO wp_options VALUES
        (1, 'siteurl', 'https://full-order.example', 'yes');

INSERT INTO wp_options
    (option_name, option_value, autoload)
VALUES
    ('siteurl', 'https://split-header.example', 'yes');

INSERT INTO wp_options (
    option_name,
    option_value,
    autoload
)
VALUES
    ('siteurl', 'https://multi-line-columns.example', 'yes');

INSERT INTO wp_options (option_value, option_name, autoload)
VALUES
    ('https://reordered.example', 'siteurl', 'yes'),
    ('https://unpaired-neighbor.example', 'blogdescription', 'yes');

INSERT INTO wp_options (option_name, option_value, autoload)
VALUES
    ('siteurl',
    'https://multi-line-tuple.example',
    'yes');

INSERT INTO wp_options (option_name, option_value, autoload)
VALUES
    -- ('siteurl', 'https://dash-comment.example', 'yes'),
    # ('home', 'https://hash-comment.example', 'yes'),
    /* ('siteurl', 'https://block-comment.example', 'yes'), */
    ('siteurl', 'https://quoted-dash.example/path--kept', 'yes'),
    ('home', 'https://quoted-hash.example/path#kept', 'yes'),
    ('siteurl', 'https://quoted-block.example/path/*kept*/', 'yes'),
    ('blogdescription', 'https://comment-control.example', 'yes'), -- ('siteurl', 'https://dash-inline-comment.example', 'yes'),
    ('blogdescription', 'https://hash-inline-control.example', 'yes'), # ('home', 'https://hash-inline-comment.example', 'yes'),
    ('blogdescription', 'https://block-inline-control.example', 'yes') /* ('siteurl', 'https://block-inline-comment.example', 'yes') */;

INSERT INTO wp_postmeta (meta_key, meta_value)
    VALUES
        ('home', 'https://unrelated-table.example', 'yes');

REPLACE INTO wp_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://replace.example', 'yes');

INSERT IGNORE INTO wp_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://ignore.example', 'yes');

INSERT INTO `db`.`wp_options` (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://qualified.example', 'yes');

INSERT INTO wp_10_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://network.example', 'yes');

INSERT INTO wp_abc_options (option_name, option_value, autoload)
    VALUES
        ('siteurl', 'https://pseudo.example', 'yes');