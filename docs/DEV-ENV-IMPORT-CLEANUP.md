# Local import credential cleanup

After a successful SQL or MyDumper import, both runtimes call
`php /dev-tools/import-cleanup.php` in the PHP service before any WordPress
search-replace, cache flush, admin creation, or VIP cleanup command.

The helper is owned and tested in `Automattic/vip-container-images`. It removes
imported connection options and flushes Memcached without loading WordPress or
Jetpack. The CLI stops if the script is missing or fails.

Publish the updated WordPress images before releasing this CLI change. Existing
environments must refresh the WordPress image and its shared `/dev-tools` volume;
a CLI upgrade alone does not install the helper.

Run the Node import tests with `npx jest __tests__/commands/dev-env-import*.ts
--runInBand` and Go tests with `go test ./internal/devenv`. Database and cache
integration tests live under `wordpress/tests` in the container repository.
