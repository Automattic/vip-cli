package devenv

import (
	"context"
	"fmt"
	"io"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// composeExecer is the subset of dockercli.Runner the post-import steps need.
// Keeping it an interface lets the sequence be unit-tested without Docker.
type composeExecer interface {
	Compose(ctx context.Context, project string, args ...string) error
}

// postImportOptions selects which post-import steps run and how loudly.
type postImportOptions struct {
	// Quiet appends --quiet to the wp-cli calls Node passes `quiet` to.
	Quiet bool
	// SkipReindex skips the Elasticsearch reindex (`--skip-reindex`/-k).
	SkipReindex bool
}

// wpArgs builds `exec -T php wp --allow-root <args...>`. --allow-root is
// required because the Go port's php container runs as root (Lando ran wp as a
// non-root user), so wp-cli would otherwise refuse with "YIKES! running as root".
func wpArgs(args ...string) []string {
	return append([]string{"exec", "-T", phpService, "wp", "--allow-root"}, args...)
}

// flushCacheArgs ports flushCache (dev-environment-database.ts:72-77).
func flushCacheArgs(quiet bool) []string {
	args := wpArgs("cache", "flush", "--skip-plugins", "--skip-themes")
	if quiet {
		args = append(args, "--quiet")
	}
	return args
}

// reindexProbeArgs / reindexArgs port reIndexSearch
// (dev-environment-database.ts:60-70): probe for the vip-search command first,
// then run the index. Node runs both inside the same try/catch.
func reindexProbeArgs() []string { return wpArgs("cli", "has-command", "vip-search") }
func reindexArgs() []string {
	return wpArgs("vip-search", "index", "--setup", "--network-wide", "--skip-confirm")
}

// addAdminUserArgs ports addAdminUser (dev-environment-database.ts:23-44).
// NOTE the quiet parameter: Node's import-sql calls addAdminUser(lando, slug)
// with no third argument (dev-env-import-sql.ts:141), so `--quiet` is never
// appended on this path even under `--quiet`/sync. Matched deliberately.
func addAdminUserArgs(password string, quiet bool) []string {
	args := wpArgs("dev-env-add-admin", "--username=vipgo", "--password="+password,
		"--skip-plugins", "--skip-themes")
	if quiet {
		args = append(args, "--quiet")
	}
	return args
}

// dataCleanupArgs ports dataCleanup (dev-environment-database.ts:46-58).
func dataCleanupArgs(quiet bool) []string {
	args := wpArgs("vip", "data-cleanup", "sql-import")
	if quiet {
		args = append(args, "--quiet")
	}
	return args
}

// postImportSteps runs Node's post-import sequence, in Node's order and with
// Node's failure semantics (src/commands/dev-env-import-sql.ts:128-142):
//
//  1. flushCache — uncaught: a failure fails the command.
//  2. reIndexSearch (unless skipped) — try/catch: "Exception means they don't
//     have vip-search enabled".
//  3. addAdminUser — uncaught: without it the user is locked out of their own
//     wp-admin, so it must be loud.
//  4. dataCleanup — caught: prints "WARNING: data cleanup failed." and continues.
//
// Skipping these is register item 2.20: an imported production dump carries the
// production users table, so the local `vipgo` account vanishes and the user
// cannot log in to their own local wp-admin.
func postImportSteps(ctx context.Context, r composeExecer, slug string, o postImportOptions, out io.Writer) error {
	if err := r.Compose(ctx, slug, flushCacheArgs(o.Quiet)...); err != nil {
		return err
	}

	if !o.SkipReindex {
		// Both calls live inside Node's single try/catch; a missing vip-search
		// (the common case — Elasticsearch is off by default) is not an error.
		if err := r.Compose(ctx, slug, reindexProbeArgs()...); err == nil {
			_ = r.Compose(ctx, slug, reindexArgs()...)
		}
	}

	// quiet=false, not o.Quiet: Node's import path calls addAdminUser with only
	// (lando, slug), so the admin step stays verbose even under --quiet and
	// under `sync sql` (which sets quiet:true). See addAdminUserArgs.
	if err := addAdminUser(ctx, r, slug, false); err != nil {
		return err
	}

	if err := r.Compose(ctx, slug, dataCleanupArgs(o.Quiet)...); err != nil {
		// Node: "This must not be a fatal error".
		fmt.Fprintln(out, "WARNING: data cleanup failed.")
	}
	return nil
}

// addAdminUser recreates the `vipgo` admin account after an import wiped the
// local users table. It reuses the environment's stored admin password so the
// credentials `dev-env info` prints keep working; a missing password (or the
// placeholder "password") is regenerated and persisted, exactly as Node does.
func addAdminUser(ctx context.Context, r composeExecer, slug string, quiet bool) error {
	d, err := instancedata.Read(slug)
	if err != nil {
		return err
	}
	password := d.AdminPassword
	if password == "" || password == "password" {
		password = generatePassword()
	}
	if err := r.Compose(ctx, slug, addAdminUserArgs(password, quiet)...); err != nil {
		return err
	}
	if password != d.AdminPassword {
		d.AdminPassword = password
		if err := instancedata.Write(slug, d); err != nil {
			return err
		}
	}
	return nil
}
