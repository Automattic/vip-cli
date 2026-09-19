package devenv

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/searchreplace"
)

// containerUploadsPath is where WordPress uploads live in the php container.
const containerUploadsPath = "/wp/wp-content/uploads"

// ImportOptions controls `import sql`.
type ImportOptions struct {
	// SearchReplace pairs ("from,to"), applied to the SQL before import.
	SearchReplace []string
	// InPlace rewrites the source SQL file with the search-replace result
	// instead of importing a throwaway copy.
	InPlace bool
	// Quiet suppresses informational output during import.
	Quiet bool
	// SkipValidate skips BOTH pre-import checks, exactly as Node's one flag
	// does (dev-env-import-sql.ts:83-101):
	//   1. the running-environment gate (php + database must be up), and
	//   2. the SQL-file validation suite (see importvalidate.go).
	// `dev-env sync sql` sets it, matching Node's runImport
	// (dev-env-sync-sql.ts:333-336) — the SQL it imports is an export it just
	// produced and search-replaced itself.
	SkipValidate bool
	// SkipReindex skips the post-import Elasticsearch reindex (Node
	// `-k/--skip-reindex`, dev-env-import-sql.ts:130). Wired.
	SkipReindex bool
	// Out receives the informational output Node prints ("Success: Database
	// imported.", the data-cleanup warning). Defaults to os.Stdout.
	Out io.Writer
	// Confirm answers the irreversible --in-place question. Injected by the
	// cobra layer so the prompt can see the --non-interactive FLAG and not
	// just the VIP_NON_INTERACTIVE env var (this package has no command to
	// hand to appctx). nil falls back to the command-less prompt.
	Confirm func(message string, defaultYes bool) (bool, error)
	// BatchMode pre-confirms the irreversible --in-place rewrite, exactly as
	// Node's batchMode does (search-and-replace.ts:151 gates the prompt on
	// `inPlace && ! batchMode`).
	//
	// `dev-env sync sql` sets it. Node never reaches this prompt from sync at
	// all: runImport (dev-env-sync-sql.ts:333-338) passes inPlace/skipValidate/
	// quiet/postImportSQL and NO searchReplace, because sync already ran its
	// own streaming replacement (:199-208). Go instead hands the pairs to
	// ImportSQL, so without this the prompt fires on a temp file the user
	// never named — asking a meaningless question interactively, and in CI
	// failing *after* the full production export has already been paid for.
	BatchMode bool
}

// searchReplacePairs passes the user's "from,to" pairs through unchanged;
// internal/searchreplace.Run already expects that comma form.
func searchReplacePairs(pairs []string) []string { return pairs }

// importCopyArgs builds `docker cp <host> <container>:<dest>`.
func importCopyArgs(hostPath, containerID, destPath string) []string {
	return []string{"cp", hostPath, containerID + ":" + destPath}
}

// importMediaCopyArgs builds `docker cp <srcDir>/. <container>:<uploads>` — the
// trailing /. copies the directory's CONTENTS into uploads.
func importMediaCopyArgs(srcDir, containerID string) []string {
	// Use explicit string concat — filepath.Join cleans "/." away.
	return []string{"cp", srcDir + "/.", containerID + ":" + containerUploadsPath}
}

// importSQLArgs builds the compose args for the SQL import:
// `exec -T php wp --allow-root db import <path>`. The leading compose binary +
// `-p <slug>` are supplied by Runner.Compose. `-T` disables TTY allocation
// (stdin is a pipe/file, not a terminal). `--allow-root` is required because the
// php container runs as root (Lando ran wp as a non-root user; the Go port does
// not), so wp-cli would otherwise refuse with "YIKES! running as root".
func importSQLArgs(containerPath string) []string {
	return []string{"exec", "-T", phpService, "wp", "--allow-root", "db", "import", containerPath}
}

// myDumperImportArgs builds the compose exec args for importing a MyDumper dump.
// Node's `db-myloader` is a Lando TOOLING alias (assets/dev-env.lando.template.yml.ejs),
// not a wp-cli command: it runs the `myloader` binary (bundled in the php-fpm
// image) against the dev-env database, streaming the dump on stdin. We invoke
// the binary directly in the php service (root, the container default), with the
// same flags getImportArgs appends (dev-env-import-sql.ts:156).
func myDumperImportArgs(sourceDB string, quiet bool, threads int) []string {
	args := []string{
		"exec", "-T", phpService,
		"myloader", "-h", "database", "-u", "wordpress", "-p", "wordpress", "--database", "wordpress",
		// --drop-table (DROP mode by default): myloader 0.21.3 deprecated
		// --overwrite-tables (it no longer drops -> "table already exists").
		"--drop-table",
	}
	if sourceDB != "" {
		args = append(args, "--source-db="+sourceDB)
	}
	args = append(args,
		"--threads="+strconv.Itoa(threads),
		"--max-threads-for-schema-creation=10",
		"--max-threads-for-index-creation=10",
		"--skip-triggers", "--skip-post", "--optimize-keys",
		"--checksum=SKIP", "--metadata-refresh-interval=2000000", "--stream",
	)
	if quiet {
		args = append(args, "--verbose=0")
	} else {
		args = append(args, "--verbose=3")
	}
	return args
}

// myDumperThreads mirrors Node's Math.max(os.cpus().length - 2, 1).
func myDumperThreads() int {
	if n := runtime.NumCPU() - 2; n > 1 {
		return n
	}
	return 1
}

// importRunner is everything the import path needs from dockercli.Runner.
// Depending on the interface (rather than the concrete runner) lets the whole
// import sequence — including Node's post-import steps — be unit-tested with
// no Docker daemon; *dockercli.Runner satisfies it.
type importRunner interface {
	composeExecer
	Docker(ctx context.Context, args ...string) error
	ComposeStdin(ctx context.Context, project string, stdin io.Reader, args ...string) error
	ComposeOut(ctx context.Context, project string, args ...string) ([]byte, error)
	ComposePS(ctx context.Context, project string) ([]dockercli.ServiceState, error)
}

// databaseService is the MariaDB service; phpService lives in devexec.go.
const databaseService = "database"

// requiredRunningServices are the two services Node checks before importing
// (dev-env-import-sql.ts:84-89 and vip-dev-env-sync-sql.js:123-126).
var requiredRunningServices = []string{phpService, databaseService}

// ErrEnvironmentNotStarted carries Node's exact UserError text
// (dev-env-import-sql.ts:92). Node routes UserError to exit.withError, which
// prints "Error: <message>" and exits 1 — the same thing returning this does.
var ErrEnvironmentNotStarted = errors.New("Environment needs to be started first")

// EnvironmentIsRunning ports isContainerRunning (dev-environment-lando.ts:1056)
// for the php + database pair: Lando asked Docker for containers labelled with
// the compose project and service and filtered on status "running"; compose's
// own `ps --format json --all` gives us the same information in one call.
//
// A ComposePS error is NOT translated into "needs to be started": that failure
// means Docker itself is unreachable, which the user needs to see verbatim.
func EnvironmentIsRunning(ctx context.Context, r importRunner, slug string) (bool, error) {
	states, err := r.ComposePS(ctx, slug)
	if err != nil {
		return false, err
	}
	running := make(map[string]bool, len(states))
	for _, s := range states {
		if strings.EqualFold(s.State, "running") {
			running[s.Service] = true
		}
	}
	for _, svc := range requiredRunningServices {
		if !running[svc] {
			return false, nil
		}
	}
	return true, nil
}

func ensureEnvironmentRunning(ctx context.Context, r importRunner, slug string) error {
	up, err := EnvironmentIsRunning(ctx, r, slug)
	if err != nil {
		return err
	}
	if !up {
		return ErrEnvironmentNotStarted
	}
	return nil
}

// containerID resolves the php service's container id for `docker cp` via
// `docker compose -p <slug> ps -q <service>`, run (by ComposeOut) from the
// env's materialized directory so compose finds its compose file.
func containerID(ctx context.Context, r importRunner, slug, service string) (string, error) {
	out, err := r.ComposeOut(ctx, slug, "ps", "-q", service)
	if err != nil {
		return "", err
	}
	id := strings.TrimRight(string(out), "\r\n")
	if id == "" {
		return "", fmt.Errorf("devenv: no running container for service %q (start the environment first)", service)
	}
	return id, nil
}

// ImportSQL imports a SQL file into a running env, optionally search-replacing
// it first. The real docker cp + exec are exercised under the devenv_e2e gate.
func ImportSQL(ctx context.Context, slug, file string, o ImportOptions) error {
	// --in-place rewrites the user's own dump irreversibly. Node reaches
	// searchAndReplace from here via resolveImportPath (dev-environment-core.ts:854)
	// with no batchMode, so its "This operation is not reversible" confirm
	// fires — unlike the platform `vip import sql` path, which pre-confirms and
	// passes batchMode:true. Gate before anything else runs: no rewrite, no
	// Docker call, nothing to undo if the answer is no. Declining exits 0 with
	// the file untouched (Node's bare process.exit()); a context that cannot
	// prompt is refused rather than silently proceeding or hanging in CI.
	if o.InPlace && len(o.SearchReplace) > 0 && !o.BatchMode {
		ask := o.Confirm
		if ask == nil {
			ask = func(message string, defaultYes bool) (bool, error) {
				return appctx.Confirm(nil, message, defaultYes)
			}
		}
		approved, err := ask(searchreplace.InPlaceConfirmMessage, false)
		if err != nil {
			return err
		}
		if !approved {
			return nil
		}
	}

	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	return importSQL(ctx, r, slug, file, o)
}

// importSQL is ImportSQL's body, parameterised over the runner so the full
// sequence (import + Node's post-import steps) is testable without Docker.
// The --in-place confirmation is handled by ImportSQL before this is reached.
func importSQL(ctx context.Context, r importRunner, slug, file string, o ImportOptions) error {
	out := o.Out
	if out == nil {
		out = os.Stdout
	}

	// Detect the dump type on the ORIGINAL file, before any rewrite or
	// decompression — GetSqlDumpDetails reads through gzip transparently.
	details, _ := searchreplace.GetSqlDumpDetails(file)

	// Decompress a compressed dump to a plaintext temp file BEFORE using it,
	// mirroring Node (dev-env-import-sql.ts:51-73). This is not optional:
	// `myloader --stream` needs the raw `-- <file> <len>` stream framing, and
	// piping it the gzip bytes instead makes it read zero files and hang
	// forever (the loader threads block on work that never arrives). `wp db
	// import` likewise needs plaintext SQL. Neither decompresses on its own.
	switch comp, derr := dumpCompression(file); {
	case derr != nil:
		return derr
	case comp == "gzip":
		if !o.Quiet {
			fmt.Fprintf(out, "Extracting the compressed file %s...\n", file)
		}
		plain, cleanup, derr := decompressDumpToTemp(file)
		if derr != nil {
			return derr
		}
		defer cleanup()
		file = plain
	case comp == "zip":
		// Node detects zip as compressed but unzipFile only extracts gzip
		// (client-file-uploader.ts:226-236), so a zip import fails the same way.
		return fmt.Errorf("Error extracting the SQL file: unsupported file format: application/zip")
	}

	isMyDumper := details.Type == searchreplace.DumpTypeMyDumper

	// Node runs the running-environment gate and the SQL validation under ONE
	// `if ( ! this.options.skipValidate )` (dev-env-import-sql.ts:83-101), so
	// --skip-validate skips both. The gate comes first here — before the
	// search-replace rather than after it as in Node — so a stopped environment
	// cannot leave the user with a rewritten (--in-place) dump and no import.
	if !o.SkipValidate {
		if err := ensureEnvironmentRunning(ctx, r, slug); err != nil {
			return err
		}
	}

	// Node's resolveImportPath: apply the file-level search-replace, then
	// validate and import the RESULT (dev-env-import-sql.ts:76-96). MyDumper
	// dumps are excluded — rewriting one invalidates the per-file byte markers
	// `myloader --stream` relies on, so those pairs are applied with
	// `wp search-replace` after the import instead (see importMyDumperDump).
	resolved := file
	if !isMyDumper && len(o.SearchReplace) > 0 {
		res, err := searchreplace.Run(file, searchReplacePairs(o.SearchReplace), searchreplace.Options{InPlace: o.InPlace})
		if err != nil {
			return err
		}
		resolved = res.OutputFileName
		// --in-place rewrites the original file; otherwise the result lives in
		// a throwaway temp dir we clean up once the import is done.
		if !o.InPlace {
			defer os.RemoveAll(filepath.Dir(res.OutputFileName))
		}
	}

	if !o.SkipValidate {
		if err := validateDevEnvSQL(sqlValidationInput{
			Path: resolved,
			// Node: `${ this.slug }.${ lando.config.domain }` (ts:95).
			ExpectedDomain:   slug + "." + devEnvDomain(slug),
			IsMyDumper:       isMyDumper,
			HasSearchReplace: len(o.SearchReplace) > 0,
			Quiet:            o.Quiet,
		}, out); err != nil {
			return err
		}
	}

	if isMyDumper {
		if err := importMyDumperDump(ctx, r, slug, resolved, details.SourceDB, o); err != nil {
			return err
		}
	} else if err := importMysqldump(ctx, r, slug, resolved); err != nil {
		return err
	}

	if !o.Quiet {
		fmt.Fprintln(out, "Success: Database imported.")
	}

	// Node's run() does not end at the import: it flushes the cache, reindexes,
	// recreates the `vipgo` admin user and runs the VIP data cleanup
	// (dev-env-import-sql.ts:128-142). Skipping them locks the user out of
	// their own local wp-admin, because the imported dump replaced the local
	// users table with the source environment's.
	return postImportSteps(ctx, r, slug, postImportOptions{
		Quiet:       o.Quiet,
		SkipReindex: o.SkipReindex,
	}, out)
}

// importMysqldump handles a plain mysqldump: `docker cp` the (already
// search-replaced) file into the php container, then `wp db import`.
func importMysqldump(ctx context.Context, r importRunner, slug, src string) error {
	cid, err := containerID(ctx, r, slug, phpService)
	if err != nil {
		return err
	}
	dest := "/tmp/" + filepath.Base(src)
	if err := r.Docker(ctx, importCopyArgs(src, cid, dest)...); err != nil {
		return err
	}
	// Run the import via the compose runner (tees output to terminal + log).
	return r.Compose(ctx, slug, importSQLArgs(dest)...)
}

// importMyDumperDump handles a MyDumper-format dump: stream the dump into
// myloader (it must NOT be file-level search-replaced — that changes content
// lengths and invalidates the per-file byte markers myloader uses to delimit
// the --stream), then search-replace the live DB with wp-cli afterward.
//
// The dump is decompressed upstream in ImportSQL before it gets here. That step
// is mandatory: a gzip-compressed stream piped into `myloader --stream` is read
// as zero files, after which the loader threads block on work that never
// arrives and the import hangs (myloader prints "Intermediate thread: SHUTDOWN"
// and nothing more). Verified end-to-end against a real VIP MyDumper backup on
// container myloader 0.21.3 — so this is the streaming bug, not the container.
func importMyDumperDump(ctx context.Context, r importRunner, slug, file, sourceDB string, o ImportOptions) error {
	if err := importMyDumper(ctx, r, slug, file, sourceDB, o.Quiet); err != nil {
		return err
	}
	return wpSearchReplace(ctx, r, slug, o.SearchReplace, o.Quiet)
}

// wpSearchReplace runs `wp search-replace <from> <to> --all-tables` for each
// "from,to" pair on the live DB (used after a MyDumper import, where the dump
// can't be file-level rewritten). wp-cli handles serialized PHP data correctly.
func wpSearchReplace(ctx context.Context, r importRunner, slug string, pairs []string, quiet bool) error {
	for _, p := range pairs {
		from, to, ok := strings.Cut(p, ",")
		if !ok || from == "" {
			continue
		}
		args := []string{"exec", "-T", phpService, "wp", "--allow-root", "search-replace", from, to, "--all-tables", "--skip-columns=guid"}
		if quiet {
			args = append(args, "--quiet")
		}
		if err := r.Compose(ctx, slug, args...); err != nil {
			return err
		}
	}
	return nil
}

// importMyDumper streams a MyDumper dump file into `myloader --stream`.
func importMyDumper(ctx context.Context, r importRunner, slug, file, sourceDB string, quiet bool) error {
	f, err := os.Open(file) // #nosec G304 -- CLI/exported dump path
	if err != nil {
		return err
	}
	defer f.Close()
	return r.ComposeStdin(ctx, slug, f, myDumperImportArgs(sourceDB, quiet, myDumperThreads())...)
}

// dumpCompression peeks the first bytes of path for a gzip/zip magic number,
// mirroring Node's detectCompressedMimeType (client-file-uploader.ts:565):
// 1f8b → "gzip", 504b0304 → "zip", anything else → "" (uncompressed). Detection
// is by content, not extension, so a misnamed .gz still imports.
func dumpCompression(path string) (string, error) {
	f, err := os.Open(path) // #nosec G304 -- CLI/exported dump path
	if err != nil {
		return "", err
	}
	defer f.Close()

	hdr := make([]byte, 4)
	n, err := io.ReadFull(f, hdr)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return "", err
	}
	hdr = hdr[:n]
	switch {
	case len(hdr) >= 2 && hdr[0] == 0x1f && hdr[1] == 0x8b:
		return "gzip", nil
	case len(hdr) >= 4 && hdr[0] == 0x50 && hdr[1] == 0x4b && hdr[2] == 0x03 && hdr[3] == 0x04:
		return "zip", nil
	}
	return "", nil
}

// decompressDumpToTemp gunzips src into a fresh temp "sql-import.sql" file and
// returns its path plus a cleanup func (Node extracts to a makeTempDir() path,
// dev-env-import-sql.ts:54-68). The caller defers cleanup.
func decompressDumpToTemp(src string) (path string, cleanup func(), err error) {
	in, err := os.Open(src) // #nosec G304 -- CLI/exported dump path
	if err != nil {
		return "", nil, err
	}
	defer in.Close()

	zr, err := gzip.NewReader(in)
	if err != nil {
		return "", nil, fmt.Errorf("Error extracting the SQL file: %s", err.Error())
	}
	defer zr.Close()

	dir, err := os.MkdirTemp("", "vip-import-")
	if err != nil {
		return "", nil, err
	}
	cleanup = func() { _ = os.RemoveAll(dir) }

	out := filepath.Join(dir, "sql-import.sql")
	f, err := os.Create(out) // #nosec G304 -- temp dir we just created
	if err != nil {
		cleanup()
		return "", nil, err
	}
	// #nosec G110 -- trusted exported/VIP-backup dump, not attacker input.
	if _, err := io.Copy(f, zr); err != nil {
		_ = f.Close()
		cleanup()
		return "", nil, fmt.Errorf("Error extracting the SQL file: %s", err.Error())
	}
	if err := f.Close(); err != nil {
		cleanup()
		return "", nil, err
	}
	return out, cleanup, nil
}

// ImportMedia copies a local media directory's contents into the env uploads.
func ImportMedia(ctx context.Context, slug, srcDir string) error {
	r, err := newRunner(ctx)
	if err != nil {
		return err
	}
	cid, err := containerID(ctx, r, slug, phpService)
	if err != nil {
		return err
	}
	return r.Docker(ctx, importMediaCopyArgs(srcDir, cid)...)
}
