INSERT INTO `wp_site` (`id`, `domain`, `path`)
VALUES
	(1,'www.example.com','/');

INSERT INTO wp_blogs VALUES (1,1,'www.example.com','/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0);

INSERT INTO wp_blogs (blog_id, site_id, domain, path, registered, last_updated, public, archived, mature, spam, deleted, lang_id)
    VALUES
       (1,1,'www.example.com','/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0);

INSERT INTO wp_blogs (blog_id, site_id, domain, path, registered, last_updated, public, archived, mature, spam, deleted, lang_id)
    VALUES
       (1,1,'www.example.com','/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0),
       (2,1,'www.example.com','/2/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0);

INSERT INTO wp_blogs (blog_id, site_id, domain, path, registered, last_updated, public, archived, mature, spam, deleted, lang_id)
    VALUES
        (1,1,'www.example.com','/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0),
        (2,1,'www.example.com','/2/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0),
        (3,1,'www.example.com','/3/','2022-07-25 00:00:00','2022-07-25 00:00:00',1,0,0,0,0,0);


