-- Remove copied service credentials before any WordPress bootstrap.
DROP PROCEDURE IF EXISTS vip_local_import_sanitize;
DELIMITER $$
CREATE PROCEDURE vip_local_import_sanitize()
BEGIN
    DECLARE finished BOOLEAN DEFAULT FALSE;
    DECLARE options_table TEXT;
    DECLARE options_tables CURSOR FOR
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND RIGHT(table_name, 7) = 'options'
          AND column_name IN ('option_id', 'option_name', 'option_value', 'autoload')
        GROUP BY table_name HAVING COUNT(DISTINCT column_name) = 4;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = TRUE;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    OPEN options_tables;
    sanitize: LOOP
        FETCH options_tables INTO options_table;
        IF finished THEN LEAVE sanitize; END IF;
        SET @vip_sanitize_query = CONCAT(
            'DELETE FROM `', REPLACE(options_table, '`', '``'), '` WHERE option_name IN (',
            '''jetpack_options'',''jetpack_private_options'',''jetpack_secrets'',''vaultpress'',''wordpress_api_key'',''vip_jetpack_connection_pilot_heartbeat'')'
        );
        PREPARE sanitation FROM @vip_sanitize_query;
        EXECUTE sanitation;
        DEALLOCATE PREPARE sanitation;
    END LOOP;
    CLOSE options_tables;
    COMMIT;
END$$
DELIMITER ;
CALL vip_local_import_sanitize();
DROP PROCEDURE vip_local_import_sanitize;
