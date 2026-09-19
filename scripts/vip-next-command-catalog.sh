#!/usr/bin/env bash
# Catalog of every vip-next command and subcommand discovered from live help.
#
# Safe by default: running this file only prints shell-escaped commands.
# Execution gates:
#   RUN=1                                      execute read-only commands
#   RUN=1 ALLOW_INTERACTIVE=1                  execute interactive commands
#   RUN=1 ALLOW_MUTATIONS=1                    execute mutating commands
#   RUN=1 ALLOW_MUTATIONS=1 ALLOW_DESTRUCTIVE=1 execute destructive commands
#   RUN=1 ALLOW_INTERACTIVE=1 ALLOW_MUTATIONS=1 ALLOW_DESTRUCTIVE=1
#                                               execute destructive interactive commands
#   RUN=1 ALLOW_EXPECTED_FAILURES=1            execute documented invalid-target calls
#
# Mutating and destructive calls target production or local Docker state. Review
# every placeholder and command before enabling any execution gate.

set -euo pipefail

VIP_NEXT="${VIP_NEXT:-./bin/vip-next}"
APP_ALIAS="@example-app.production"
DEV_ENV_SLUG="cutover-test"

# Replace these values before opting into execution.
DEPLOY_ARCHIVE="${DEPLOY_ARCHIVE:-./cutover-test-app.zip}"
APP_LOOKUP="${APP_LOOKUP:-3453}"
SQL_FILE="${SQL_FILE:-./cutover-test.sql}"
MEDIA_ARCHIVE="${MEDIA_ARCHIVE:-./cutover-test-media.zip}"
MEDIA_DIRECTORY="${MEDIA_DIRECTORY:-./cutover-test-media}"
SEARCH_REPLACE_FILE="${SEARCH_REPLACE_FILE:-$SQL_FILE}"
SEARCH_REPLACE_PAIR="${SEARCH_REPLACE_PAIR:-https://example.invalid,https://cutover-test.vipdev.site}"
PURGE_URL="${PURGE_URL:-https://example.invalid/}"
ENVVAR_NAME="${ENVVAR_NAME:-CUTOVER_TEST_VAR}"
ENVVAR_VALUE="${ENVVAR_VALUE:-cutover-test-value}"
ENVVAR_VALUE_FILE="${ENVVAR_VALUE_FILE:-./cutover-test-envvar.txt}"
SOFTWARE_COMPONENT="${SOFTWARE_COMPONENT:-php}"
SOFTWARE_VERSION="${SOFTWARE_VERSION:-8.3}"
DEV_ENV_PHP_VERSION="${DEV_ENV_PHP_VERSION:-8.3}"
DEV_ENV_TITLE="${DEV_ENV_TITLE:-Cutover Test}"
DEFENSIVE_ENABLED="${DEFENSIVE_ENABLED:-true}"
DEFENSIVE_CHALLENGE_TYPE="${DEFENSIVE_CHALLENGE_TYPE:-1}"
DEFENSIVE_ABSOLUTE_THRESHOLD="${DEFENSIVE_ABSOLUTE_THRESHOLD:-100}"
DEFENSIVE_PERCENT_THRESHOLD="${DEFENSIVE_PERCENT_THRESHOLD:-50}"

RUN="${RUN:-0}"
ALLOW_INTERACTIVE="${ALLOW_INTERACTIVE:-0}"
ALLOW_MUTATIONS="${ALLOW_MUTATIONS:-0}"
ALLOW_DESTRUCTIVE="${ALLOW_DESTRUCTIVE:-0}"
ALLOW_EXPECTED_FAILURES="${ALLOW_EXPECTED_FAILURES:-0}"

SUITE_PASSED=0
SUITE_FAILED=0
SUITE_SKIPPED=0
SUITE_EXPECTED_FAILURES=0
FAILED_STATUSES=()
FAILED_COMMANDS=()

print_command() {
	printf '+ '
	printf '%q ' "$@"
	printf '\n'
}

run_command() {
	local enabled="$1"
	shift
	print_command "$@"
	if [[ "$enabled" != "1" ]]; then
		SUITE_SKIPPED=$((SUITE_SKIPPED + 1))
		return 0
	fi
	if "$@"; then
		SUITE_PASSED=$((SUITE_PASSED + 1))
	else
		local status=$?
		local rendered
		printf -v rendered '%q ' "$@"
		rendered="${rendered% }"
		SUITE_FAILED=$((SUITE_FAILED + 1))
		FAILED_STATUSES[$SUITE_FAILED]="$status"
		FAILED_COMMANDS[$SUITE_FAILED]="$rendered"
		printf '# command failed (exit %d): %s\n' "$status" "$rendered" >&2
	fi
	return 0
}

print_failure_ledger() {
	if ((SUITE_FAILED == 0)); then
		return 0
	fi
	printf '# failed commands:\n'
	local index
	for ((index = 1; index <= SUITE_FAILED; index++)); do
		printf '# [%d/%d] exit=%d\n' \
			"$index" "$SUITE_FAILED" "${FAILED_STATUSES[$index]}"
		printf '#   command: %s\n' "${FAILED_COMMANDS[$index]}"
	done
}

run_readonly() {
	local enabled=0
	if [[ "$RUN" == "1" ]]; then
		enabled=1
	fi
	run_command "$enabled" "$@"
}

run_interactive() {
	local enabled=0
	if [[ "$RUN" == "1" && "$ALLOW_INTERACTIVE" == "1" ]]; then
		enabled=1
	fi
	run_command "$enabled" "$@"
}

run_mutation() {
	local enabled=0
	if [[ "$RUN" == "1" && "$ALLOW_MUTATIONS" == "1" ]]; then
		enabled=1
	fi
	run_command "$enabled" "$@"
}

run_destructive() {
	local enabled=0
	if [[ "$RUN" == "1" && "$ALLOW_MUTATIONS" == "1" && "$ALLOW_DESTRUCTIVE" == "1" ]]; then
		enabled=1
	fi
	run_command "$enabled" "$@"
}

run_destructive_interactive() {
	local enabled=0
	if [[ "$RUN" == "1" && "$ALLOW_INTERACTIVE" == "1" && "$ALLOW_MUTATIONS" == "1" && "$ALLOW_DESTRUCTIVE" == "1" ]]; then
		enabled=1
	fi
	run_command "$enabled" "$@"
}

# Runs a call that is DOCUMENTED to be rejected — e.g. platform `sync` targeting
# production, which has no valid child target.
#
# A zero exit is a FAILURE, not a pass. Treating both outcomes as success made
# this gate unfalsifiable: it would have reported PASS if vip-next ever started
# ACCEPTING a sync into production, which is precisely the regression the entry
# exists to catch. Regression tests: scripts/catalog_script_test.go.
run_expected_failure() {
	local enabled=0
	if [[ "$RUN" == "1" && "$ALLOW_EXPECTED_FAILURES" == "1" ]]; then
		enabled=1
	fi
	print_command "$@"
	if [[ "$enabled" != "1" ]]; then
		SUITE_SKIPPED=$((SUITE_SKIPPED + 1))
		return 0
	fi
	set +e
	"$@"
	local status=$?
	set -e
	printf '# expected-failure exit status: %d\n' "$status"
	if ((status == 0)); then
		local rendered
		printf -v rendered '%q ' "$@"
		rendered="${rendered% }"
		SUITE_FAILED=$((SUITE_FAILED + 1))
		FAILED_STATUSES[$SUITE_FAILED]="$status"
		FAILED_COMMANDS[$SUITE_FAILED]="$rendered"
		printf '# expected-failure command unexpectedly succeeded (exit 0): %s\n' "$rendered" >&2
		printf '#   this call is documented as invalid; a zero exit means vip-next now accepts it\n' >&2
		return 0
	fi
	SUITE_EXPECTED_FAILURES=$((SUITE_EXPECTED_FAILURES + 1))
	return 0
}

# COMMAND: logout
# Deletes the locally stored authentication token. Destructive because later
# authenticated calls will fail until login succeeds.
run_destructive "$VIP_NEXT" logout

# COMMAND: login
# Opens the interactive Personal Access Token login flow and stores the token.
run_interactive "$VIP_NEXT" login

# COMMAND: whoami
# Prints details for the currently authenticated user.
run_readonly "$VIP_NEXT" whoami

# COMMAND: <root>
# Displays the root help and top-level command tree.
run_readonly "$VIP_NEXT" --help

# COMMAND: app
# Displays help for application discovery, lookup, and deploy operations.
run_readonly "$VIP_NEXT" app --help

# COMMAND: app <name>
# Retrieves the configured application and its environments through wildcard lookup.
run_readonly "$VIP_NEXT" app "$APP_LOOKUP" --format json

# COMMAND: app list
# Lists applications visible to the authenticated user.
run_readonly "$VIP_NEXT" app list --format json

# COMMAND: app deploy
# Uploads and deploys an application archive to production. Requires a valid
# WPVIP_DEPLOY_TOKEN in the environment and all destructive gates.
run_destructive "$VIP_NEXT" "$APP_ALIAS" app deploy "$DEPLOY_ARCHIVE" --skip-confirmation

# COMMAND: app deploy validate
# Validates the application archive locally without deploying it.
run_readonly "$VIP_NEXT" app deploy validate "$DEPLOY_ARCHIVE"

# COMMAND: backup
# Displays help for environment backup commands.
run_readonly "$VIP_NEXT" backup --help

# COMMAND: backup db
# Starts or follows a production database backup job.
run_mutation "$VIP_NEXT" "$APP_ALIAS" backup db

# COMMAND: cache
# Displays help for edge-cache operations.
run_readonly "$VIP_NEXT" cache --help

# COMMAND: cache purge-url
# Purges one URL from the production edge cache.
run_mutation "$VIP_NEXT" "$APP_ALIAS" cache purge-url "$PURGE_URL"

# COMMAND: completion
# Displays help for shell completion generators.
run_readonly "$VIP_NEXT" completion --help

# COMMAND: completion bash
# Writes a Bash completion script to standard output.
run_readonly "$VIP_NEXT" completion bash

# COMMAND: completion fish
# Writes a Fish completion script to standard output.
run_readonly "$VIP_NEXT" completion fish

# COMMAND: completion powershell
# Writes a PowerShell completion script to standard output.
run_readonly "$VIP_NEXT" completion powershell

# COMMAND: completion zsh
# Writes a Zsh completion script to standard output.
run_readonly "$VIP_NEXT" completion zsh

# COMMAND: config
# Displays help for environment configuration commands.
run_readonly "$VIP_NEXT" config --help

# COMMAND: config envvar
# Displays help for platform environment-variable commands.
run_readonly "$VIP_NEXT" config envvar --help

# COMMAND: config envvar delete
# Permanently deletes one production environment variable.
run_destructive "$VIP_NEXT" "$APP_ALIAS" config envvar delete "$ENVVAR_NAME" --skip-confirmation

# COMMAND: config envvar get
# Retrieves one production environment-variable value; output may be sensitive.
run_readonly "$VIP_NEXT" "$APP_ALIAS" config envvar get "$ENVVAR_NAME"

# COMMAND: config envvar get-all
# Retrieves all production environment variables and values; output is sensitive.
run_readonly "$VIP_NEXT" "$APP_ALIAS" config envvar get-all --format json

# COMMAND: config envvar list
# Lists production environment-variable names without their values.
run_readonly "$VIP_NEXT" "$APP_ALIAS" config envvar list --format json

# COMMAND: config envvar set
# Sets one production environment variable from a local UTF-8 file.
run_mutation "$VIP_NEXT" "$APP_ALIAS" config envvar set "$ENVVAR_NAME" --from-file "$ENVVAR_VALUE_FILE" --skip-confirmation

# COMMAND: config software
# Displays help for software-version commands.
run_readonly "$VIP_NEXT" config software --help

# COMMAND: config software get
# Retrieves the selected production software component and available versions.
run_readonly "$VIP_NEXT" "$APP_ALIAS" config software get "$SOFTWARE_COMPONENT" --include available_versions --format json

# COMMAND: config software update
# Updates a production software component to the configured version.
run_mutation "$VIP_NEXT" "$APP_ALIAS" config software update "$SOFTWARE_COMPONENT" "$SOFTWARE_VERSION" --yes

# COMMAND: db
# Displays help for database-access commands.
run_readonly "$VIP_NEXT" db --help

# COMMAND: db phpmyadmin
# Enables or refreshes production phpMyAdmin access and prints its read-only URL.
run_mutation "$VIP_NEXT" "$APP_ALIAS" db phpmyadmin --print

# COMMAND: defensive-mode
# Displays help for WAF defensive-mode operations.
run_readonly "$VIP_NEXT" defensive-mode --help

# Step-up auth and the three defensive-mode calls below.
#
# --non-interactive does NOT suppress step-up: whether a mutation needs
# browser verification is the server's call, and no client flag can waive it.
# What it does is make an unsatisfiable challenge fail immediately (exit 1,
# "Step-up verification is required for <op>, but this is a non-interactive
# session") instead of printing a URL and polling until the session expires.
# --skip-confirmation is a separate thing again: it waives this CLI's own
# production prompt, not the server's step-up.
#
# So these three succeed only when the environment does not require step-up for
# the mutation, or when an interactive approval is still cached from an earlier
# run. To complete a challenge from here, drop --non-interactive (a TTY, opens a
# browser) or add --rechallenge-wait / VIP_RECHALLENGE_WAIT=1 to print the URL
# and block while you approve on another device.

# COMMAND: defensive-mode configure
# Updates the production defensive-mode configuration.
run_mutation "$VIP_NEXT" "$APP_ALIAS" defensive-mode configure \
	--enabled "$DEFENSIVE_ENABLED" \
	--challenge-type "$DEFENSIVE_CHALLENGE_TYPE" \
	--connection-threshold-absolute "$DEFENSIVE_ABSOLUTE_THRESHOLD" \
	--connection-threshold-percentage "$DEFENSIVE_PERCENT_THRESHOLD" \
	--non-interactive \
	--skip-confirmation

# COMMAND: defensive-mode disable
# Disables production defensive mode.
run_mutation "$VIP_NEXT" "$APP_ALIAS" defensive-mode disable --non-interactive --skip-confirmation

# COMMAND: defensive-mode enable
# Enables production defensive mode.
run_mutation "$VIP_NEXT" "$APP_ALIAS" defensive-mode enable --non-interactive --skip-confirmation

# COMMAND: dev-env
# Displays help for local development-environment commands.
run_readonly "$VIP_NEXT" dev-env --help

# COMMAND: dev-env create
# Creates cutover-test locally without a wizard or automatic start.
run_mutation "$VIP_NEXT" dev-env create --slug "$DEV_ENV_SLUG" --title "$DEV_ENV_TITLE" --start=false --non-interactive

# COMMAND: dev-env destroy
# Removes cutover-test and its local data.
run_destructive "$VIP_NEXT" dev-env destroy --slug "$DEV_ENV_SLUG" --yes

# COMMAND: dev-env create
# Creates cutover-test locally without a wizard or automatic start.
run_mutation "$VIP_NEXT" dev-env create --slug "$DEV_ENV_SLUG" --title "$DEV_ENV_TITLE" --start=true --non-interactive

# COMMAND: dev-env envvar
# Displays help for local environment-variable commands.
run_readonly "$VIP_NEXT" dev-env envvar --help

# COMMAND: dev-env envvar set
# Sets one variable in cutover-test using a bounded positional value.
run_mutation "$VIP_NEXT" dev-env envvar set "$ENVVAR_NAME" "$ENVVAR_VALUE" --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env envvar delete
# Deletes one variable from cutover-test.
run_destructive "$VIP_NEXT" dev-env envvar delete "$ENVVAR_NAME" --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env envvar get
# Retrieves one variable from cutover-test.
run_readonly "$VIP_NEXT" dev-env envvar get "$ENVVAR_NAME" --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env envvar get-all
# Retrieves every variable and value from cutover-test.
run_readonly "$VIP_NEXT" dev-env envvar get-all --slug "$DEV_ENV_SLUG" --format json

# COMMAND: dev-env envvar list
# Lists variable names stored for cutover-test.
run_readonly "$VIP_NEXT" dev-env envvar list --slug "$DEV_ENV_SLUG" --format json


# COMMAND: dev-env exec
# Runs a read-only WP-CLI home-option lookup inside cutover-test.
run_readonly "$VIP_NEXT" dev-env exec --slug "$DEV_ENV_SLUG" -- wp option get home

# COMMAND: dev-env import
# Displays help for local import commands.
run_readonly "$VIP_NEXT" dev-env import --help

# COMMAND: dev-env import media
# Copies a local media directory into cutover-test.
run_destructive "$VIP_NEXT" dev-env import media "$MEDIA_DIRECTORY" --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env import sql
# Replaces the cutover-test database from a local SQL file.
run_destructive "$VIP_NEXT" dev-env import sql "$SQL_FILE" --slug "$DEV_ENV_SLUG" --quiet

# COMMAND: dev-env info
# Prints information about cutover-test.
run_readonly "$VIP_NEXT" dev-env info --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env list
# Lists all local development environments.
run_readonly "$VIP_NEXT" dev-env list

# COMMAND: dev-env logs
# Prints current PHP service logs for cutover-test without following them.
run_readonly "$VIP_NEXT" dev-env logs --slug "$DEV_ENV_SLUG" --service php

# COMMAND: dev-env purge
# Removes every local VIP development environment, not only cutover-test.
run_destructive "$VIP_NEXT" dev-env purge --yes

# COMMAND: dev-env shell
# Runs a bounded pwd command in the cutover-test PHP service shell.
run_readonly "$VIP_NEXT" dev-env shell --slug "$DEV_ENV_SLUG" --service php -- pwd

# COMMAND: dev-env start
# Starts cutover-test while skipping confirmation prompts.
run_mutation "$VIP_NEXT" dev-env start --slug "$DEV_ENV_SLUG" --skip-confirmation

# COMMAND: dev-env stop
# Stops cutover-test.
run_mutation "$VIP_NEXT" dev-env stop --slug "$DEV_ENV_SLUG"

# COMMAND: dev-env sync
# Displays help for platform-to-local synchronization.
run_readonly "$VIP_NEXT" dev-env sync --help

# COMMAND: dev-env sync sql
# Replaces the cutover-test database from the selected production environment;
# unresolved multisite mappings fail with recovery flags instead of prompting.
run_destructive "$VIP_NEXT" "$APP_ALIAS" dev-env sync sql --slug "$DEV_ENV_SLUG" --force --non-interactive

# COMMAND: dev-env update
# Updates cutover-test to the configured PHP version without opening its wizard.
run_mutation "$VIP_NEXT" dev-env update --slug "$DEV_ENV_SLUG" --php "$DEV_ENV_PHP_VERSION" --non-interactive

# COMMAND: export
# Displays help for export commands.
run_readonly "$VIP_NEXT" export --help

# COMMAND: export sql
# Creates or refreshes the production export job but skips the local download.
run_mutation "$VIP_NEXT" "$APP_ALIAS" export sql --skip-download

# COMMAND: help
# Displays root command help through Cobra's explicit help command.
run_readonly "$VIP_NEXT" help

# COMMAND: import
# Displays help for platform import and validation commands.
run_readonly "$VIP_NEXT" import --help

# COMMAND: import media
# Imports a media archive into production.
run_destructive "$VIP_NEXT" "$APP_ALIAS" import media "$MEDIA_ARCHIVE" --skip-confirmation

# COMMAND: import media abort
# Aborts the currently running production media import.
run_mutation "$VIP_NEXT" "$APP_ALIAS" import media abort --skip-confirmation

# COMMAND: import media status
# Retrieves production media-import status without downloading an error log.
run_readonly "$VIP_NEXT" "$APP_ALIAS" import media status --saveErrorLog=false

# COMMAND: import sql
# Replaces the production database from a SQL file. This is intentionally behind
# every destructive gate and may still prompt for command-specific confirmation.
run_destructive_interactive "$VIP_NEXT" "$APP_ALIAS" import sql "$SQL_FILE"

# COMMAND: import sql status
# Retrieves the latest production SQL-import status.
run_readonly "$VIP_NEXT" "$APP_ALIAS" import sql status

# COMMAND: import validate-files
# Validates a local media directory against VIP import constraints.
run_readonly "$VIP_NEXT" import validate-files "$MEDIA_DIRECTORY"

# COMMAND: import validate-sql
# Validates a local SQL file for unsupported statements.
run_readonly "$VIP_NEXT" import validate-sql "$SQL_FILE"

# COMMAND: logs
# Retrieves ten production runtime log entries as JSON without following.
run_readonly "$VIP_NEXT" "$APP_ALIAS" logs --limit 10 --format json

# COMMAND: search-replace
# Streams a local SQL search-replace result to standard output without changing files.
run_readonly "$VIP_NEXT" search-replace "$SEARCH_REPLACE_FILE" --search-replace "$SEARCH_REPLACE_PAIR"

# COMMAND: slowlogs
# Retrieves ten production MySQL slow-log entries as JSON.
run_readonly "$VIP_NEXT" "$APP_ALIAS" slowlogs --limit 10 --format json

# COMMAND: sync
# Platform sync requires a child target, so production is intentionally invalid.
# The exact required alias is retained and execution needs ALLOW_EXPECTED_FAILURES=1.
run_expected_failure "$VIP_NEXT" "$APP_ALIAS" sync --skip-confirmation

# COMMAND: wp
# Runs a bounded read-only WP-CLI lookup in production. --yes is extracted before
# the raw WP-CLI argument stream, as required by vip-next routing.
run_readonly "$VIP_NEXT" "$APP_ALIAS" --yes -- wp option get home

printf '# suite summary: passed=%d failed=%d skipped=%d expected-failures=%d\n' \
	"$SUITE_PASSED" "$SUITE_FAILED" "$SUITE_SKIPPED" "$SUITE_EXPECTED_FAILURES"
print_failure_ledger
if ((SUITE_FAILED > 0)); then
	exit 1
fi
