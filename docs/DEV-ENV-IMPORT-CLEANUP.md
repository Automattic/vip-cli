# Local import credential cleanup

Node and Go imports remove copied service credentials immediately after the
mysql/myloader import, before running WordPress commands. This includes Go's
MyDumper search-and-replace. Cleanup uses the database client directly and does
not depend on Jetpack or MU plugin availability. A cleanup failure stops the
command before WordPress post-import work. It also flushes the dedicated local
Memcached service directly, without bootstrapping WordPress, so cached imported
options from any subsite cannot survive the database deletion. Cache flush
failures stop the command as well.

The SQL discovers WordPress options tables by their suffix and standard columns,
including custom prefixes and inactive or orphaned subsite tables. It deletes
only `jetpack_options`, `jetpack_private_options`, `jetpack_secrets`, `vaultpress`,
`wordpress_api_key`, and `vip_jetpack_connection_pilot_heartbeat`. Removing the
whole `jetpack_options` container also resets settings stored there, matching
VIP's existing migration cleanup. Other options remain intact.

Cleanup rolls back on SQL errors for InnoDB tables. Nontransactional tables can
be partially cleaned on failure; the command still stops before WordPress runs.
The temporary procedure is removed on success and attempted again on failure.
The later MU cleanup remains useful for standalone `wp vip data-cleanup
sql-import` runs and customer cleanup hooks.

The Node asset `assets/dev-env-import-cleanup.sql` and Go embedded asset
`internal/devenv/import_cleanup.sql` must stay identical. The cache flush PHP
assets are also shared between runtimes. Unit tests check both copies.

Run focused checks:

```sh
npm run jest -- --runTestsByPath __tests__/commands/dev-env-import-credentials.ts
go test ./internal/devenv
```

Real Node/Go SQL parity is opt-in and uses a disposable database container. It
checks custom prefixes, retained subsite tables, identifier escaping, unrelated
options, idempotence, rollback after an injected SQL failure, routine cleanup,
and persistent caches for the main site and subsites, including an unavailable
cache service.
It does not alter host trust or hosts files. With Docker running:

```sh
npm run build
docker network create vip-import-cleanup-test-network
docker run --rm --network vip-import-cleanup-test-network --name vip-import-cleanup-test-local \
  -e MYSQL_ROOT_PASSWORD=wordpress -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=wordpress -e MYSQL_PASSWORD=wordpress -d mysql:8
docker run --rm --network vip-import-cleanup-test-network --network-alias memcached \
  --name vip-import-cleanup-test-cache -d memcached:1.6-alpine
# Requires ghcr.io/automattic/vip-container-images/wp-test-runner:latest for PHP.
# Wait for mysqladmin ping to succeed, then:
VIP_IMPORT_CLEANUP_TEST_CONTAINER=vip-import-cleanup-test-local \
VIP_IMPORT_CLEANUP_TEST_NETWORK=vip-import-cleanup-test-network \
  go test -count=1 -tags='parity import_cleanup_integration' ./internal/parity \
  -run TestDevEnvImportCredentialCleanupRealDatabase -v
docker rm -f vip-import-cleanup-test-local vip-import-cleanup-test-cache
docker network rm vip-import-cleanup-test-network
```

Use only a disposable container: the fixture replaces its test tables and the
sanitizer removes credential options from all matching options tables. Both
MySQL 8 and MariaDB support the procedure syntax.
