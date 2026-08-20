//go:build parity

package parity

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// The Node-vs-Go differential for everything OUTSIDE the M5 command surface.
//
// WHY THIS FILE EXISTS
//
// testdata/parity/ holds 85 scenarios. Until this file, 31 of them (M5, via
// m5_differential_test.go) plus TestWhoamiBaselineParity ran BOTH CLIs and
// diffed them. The other ~53 spawned vip-next ONLY, against an httptest mock,
// and asserted with strings.Contains — Go-behaviour tests wearing a parity
// build tag. Every one of them passes just as happily when Go and Node
// disagree, which is how ~90 divergences survived to a manual review.
//
// TestSurfaceDifferentialParity is the same rig as M5's, applied to the rest:
// one shared httptest server, one seeded Node credential for the whole test
// binary (see differential_test.go and keychain.go for why that is not
// negotiable), stdout + stderr + exit code compared byte for byte.
//
// WHAT MAKES A SCENARIO CONVERTIBLE
//
// The three M5 conditions still hold — side-effect free at the mock, every
// operation BOTH CLIs issue is served, no credential beyond the seeded one —
// plus two this surface adds:
//
//  4. the argv must be VALID FOR NODE. Several scenarios were written against
//     vip-next's flag set and Node rejects them outright ("The option
//     'skip-confirmation' is unknown"); running those compares a working
//     command against a usage error, which measures nothing.
//  5. a poll loop must terminate on fixtures alone. Node's intervals are
//     hardcoded — 1000ms for backup db and export sql (src/commands/backup-db.ts:18,
//     src/commands/export-sql.ts:34), 5000ms for import sql
//     (src/lib/site-import/status.ts:25), plus an unconditional 30s sleep after
//     enabling phpMyAdmin (src/commands/phpmyadmin.ts:220). Node honours no
//     VIP_*_INTERVAL_MS; those variables are vip-next's alone. A scenario whose
//     fixtures reach a terminal state on the first response costs nothing, one
//     that needs five polls costs five seconds of every CI run.
//
// Anything failing one of the five is listed in surfaceDifferentialExclusions
// with the specific reason. TestEverySurfaceScenarioIsClassified fails when a
// scenario appears in neither map, so a new YAML cannot quietly opt out.
//
// ON FAILING SUBTESTS
//
// A divergence here is a FINDING, not a bug in the harness, and it is left
// RED on purpose. It may only be downgraded by an expected_drift annotation in
// the scenario YAML, which records both the product decision and an exact
// normalized-output fingerprint. A changed fingerprint is red again.

// surfaceMuxFactory builds a FRESH handler for one binary's run, together with
// an accessor for that handler's own mutation counters.
//
// Freshness is the point. Every family mux counts mutations with an atomic, and
// a differential runs the command TWICE against one server. Sharing a handler
// would make "StartImport fired 0 times" mean "fired 0 times across both CLIs",
// which is a strictly weaker claim and silently tolerates one CLI firing twice
// while the other fires never. Building the mux per side keeps each count a
// statement about a single implementation.
type surfaceMuxFactory func(t *testing.T, recordingDir string) (http.Handler, func() map[string]int32)

// nullMux answers every request with {"data":null}.
//
// It is for the LOCAL-ONLY commands — validate-sql, app deploy validate — which
// make no API call at all. It is deliberately not "no handler": the rig's
// default handler answers 500 with a marker body, and a command that
// unexpectedly starts calling the API should show up as a diff rather than as a
// connection error that looks the same on both sides.
func nullMux(t *testing.T, _ string) (http.Handler, func() map[string]int32) {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":null}`))
	}), func() map[string]int32 { return map[string]int32{} }
}

func cachePurgeSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := cachePurgeMux(t, rec)
	return h, func() map[string]int32 { return map[string]int32{"PurgePageCache": hits()} }
}

func envvarSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := envvarMutationMux(t, rec)
	return h, func() map[string]int32 {
		add, del := hits()
		return map[string]int32{"AddEnvironmentVariable": add, "DeleteEnvironmentVariable": del}
	}
}

func phpmyadminSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := phpmyadminMux(t, rec)
	return h, func() map[string]int32 {
		en, st, gn := hits()
		return map[string]int32{"EnablePhpMyAdmin": en, "PhpMyAdminStatus": st, "GeneratePhpMyAdminAccess": gn}
	}
}

func importSQLSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := importSQLMux(t, rec)
	return h, func() map[string]int32 { return map[string]int32{"StartImport": hits()} }
}

func importMediaSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := importMediaMux(t, rec)
	return h, func() map[string]int32 {
		start, abort := hits()
		return map[string]int32{"StartMediaImport": start, "AbortMediaImport": abort}
	}
}

func syncSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := syncMux(t, rec)
	return h, func() map[string]int32 {
		start, progress := hits()
		return map[string]int32{"SyncEnvironment": start, "SyncProgress": progress}
	}
}

func m7cSurfaceMux(t *testing.T, rec string) (http.Handler, func() map[string]int32) {
	h, hits := m7cMux(t, rec)
	return h, func() map[string]int32 {
		return map[string]int32{
			"TriggerDatabaseBackup": hits("TriggerDatabaseBackup"),
			"BackupDBCopy":          hits("BackupDBCopy"),
			"StartCustomDeploy":     hits("StartCustomDeploy"),
		}
	}
}

// surfaceCase is one convertible scenario.
type surfaceCase struct {
	// mux builds the API mock. Required.
	mux surfaceMuxFactory

	// wantHits, when set, asserts a mutation count against EACH binary's own
	// counters. This is what stops a "the mutation must not fire" scenario from
	// degrading into "the mutation did not fire in total".
	wantHits map[string]int32
}

// surfaceDifferentialScenarios is the vetted allowlist. Ordering is by family
// so the reason a family is present or absent stays legible.
var surfaceDifferentialScenarios = map[string]surfaceCase{
	// --- cache purge-url -------------------------------------------------
	// Single mutation, no polling, no prompt. The mock had to learn Node's
	// operation name (PurgePageCacheMutation) before these could run.
	"cache-purge-url-single": {mux: cachePurgeSurfaceMux, wantHits: map[string]int32{"PurgePageCache": 1}},
	"cache-purge-url-multi":  {mux: cachePurgeSurfaceMux, wantHits: map[string]int32{"PurgePageCache": 1}},
	"cache-purge-url-empty":  {mux: cachePurgeSurfaceMux, wantHits: map[string]int32{"PurgePageCache": 0}},
	// --from-file must WIN over the positional URLs on both sides; the
	// recording's urls.txt and the ignored positional make that observable in
	// the diffed stdout.
	"cache-purge-url-from-file": {mux: cachePurgeSurfaceMux, wantHits: map[string]int32{"PurgePageCache": 1}},

	// --- config envvar set / delete --------------------------------------
	// The mutating half of the envvar surface. M5 covers only the reads.
	"envvar-set-baseline":             {mux: envvarSurfaceMux, wantHits: map[string]int32{"AddEnvironmentVariable": 1}},
	"envvar-set-invalid-name":         {mux: envvarSurfaceMux, wantHits: map[string]int32{"AddEnvironmentVariable": 0}},
	"envvar-set-newrelic-blocked":     {mux: envvarSurfaceMux, wantHits: map[string]int32{"AddEnvironmentVariable": 0}},
	"envvar-set-prod-cancel":          {mux: envvarSurfaceMux, wantHits: map[string]int32{"AddEnvironmentVariable": 0}},
	"envvar-set-prod-confirm-skipped": {mux: envvarSurfaceMux, wantHits: map[string]int32{"AddEnvironmentVariable": 1}},
	"envvar-delete-baseline":          {mux: envvarSurfaceMux, wantHits: map[string]int32{"DeleteEnvironmentVariable": 1}},
	"envvar-delete-prod-cancel":       {mux: envvarSurfaceMux, wantHits: map[string]int32{"DeleteEnvironmentVariable": 0}},
	"envvar-delete-typed-mismatch":    {mux: envvarSurfaceMux, wantHits: map[string]int32{"DeleteEnvironmentVariable": 0}},

	// --- db phpmyadmin ----------------------------------------------------
	// Both recordings report status "running" on the first poll, which is what
	// keeps Node off its unconditional 30-second post-enable sleep
	// (src/commands/phpmyadmin.ts:220).
	"phpmyadmin-print":  {mux: phpmyadminSurfaceMux, wantHits: map[string]int32{"EnablePhpMyAdmin": 0, "GeneratePhpMyAdminAccess": 1}},
	"phpmyadmin-silent": {mux: phpmyadminSurfaceMux, wantHits: map[string]int32{"EnablePhpMyAdmin": 0, "GeneratePhpMyAdminAccess": 1}},
	// The error recording has no status.json, so status is unknown on both
	// sides and both take the enable branch, where the mutation errors. Node
	// exits on the GraphQL error before it reaches the poll and the 30s sleep,
	// which is what keeps this scenario cheap.
	"phpmyadmin-error": {mux: phpmyadminSurfaceMux, wantHits: map[string]int32{"EnablePhpMyAdmin": 1, "GeneratePhpMyAdminAccess": 0}},

	// --- import validate-sql ---------------------------------------------
	// Local-only static validator: no app context, no API call from either CLI.
	// The cheapest honest differential in the repo.
	"import-validate-sql-clean":          {mux: nullMux},
	"import-validate-sql-multisite-warn": {mux: nullMux},
	"import-validate-sql-dangerous-stmt": {mux: nullMux},

	// --- import validate-files -------------------------------------------
	// Local traversal, but Node fetches MediaImportConfig for the limits
	// (allowed extensions, size cap, filename length), so it needs the mock.
	"import-validate-files-clean":   {mux: importMediaSurfaceMux},
	"import-validate-files-not-dir": {mux: importMediaSurfaceMux},

	// --- app deploy -------------------------------------------------------
	// validate is local-only; missing-token fails its gate before any call.
	"app-deploy-validate-clean":          {mux: nullMux},
	"app-deploy-validate-missing-themes": {mux: nullMux},
	"app-deploy-missing-token":           {mux: nullMux},

	// --- import sql gates -------------------------------------------------
	// Every one aborts at a client-side gate, so no import is ever started;
	// the counter assertion is per-binary, which is what makes it meaningful
	// when two CLIs share one server.
	"import-sql-bad-extension": {mux: importSQLSurfaceMux, wantHits: map[string]int32{"StartImport": 0}},
	"import-sql-invalid-md5":   {mux: importSQLSurfaceMux, wantHits: map[string]int32{"StartImport": 0}},
	"import-sql-in-progress":   {mux: importSQLSurfaceMux, wantHits: map[string]int32{"StartImport": 0}},

	// --- backup db --------------------------------------------------------
	// The already-in-progress recording reports inProgressLock on the first
	// status and clears it on the second, so Node spends one 1s interval here.
	"backup-db-already-in-progress": {mux: m7cSurfaceMux, wantHits: map[string]int32{"TriggerDatabaseBackup": 0}},

	// --- export sql -------------------------------------------------------
	// Fails the flag-exclusivity check before any network call.
	"export-sql-config-conflict": {mux: m7cSurfaceMux, wantHits: map[string]int32{"BackupDBCopy": 0}},
}

// surfaceDifferentialExclusions records scenarios deliberately NOT run as
// differentials, each with the reason it cannot be one.
//
// Keep the reason SPECIFIC and CHECKED. "Flaky" is not a reason. "Node rejects
// --skip-confirmation on this command, so the comparison would be a working
// command against a usage error" is. Every reason below was observed by running
// the real Node binary, not inferred from src/.
var surfaceDifferentialExclusions = map[string]string{
	// ---- covered elsewhere ----
	"whoami-baseline": "already a real Node-vs-Go differential — TestWhoamiBaselineParity " +
		"(whoami_scenario_test.go) owns it, with its own single-fixture handler.",
	"version-smoke": "not a Node-vs-Go scenario at all: it self-diffs vip-next against a " +
		"second vip-next built with different version metadata, to prove the harness " +
		"pipeline works. Node prints `4.1.0` and vip-next prints " +
		"`vip-next <ver> (commit <sha>)` — an intentional format change (register §3), " +
		"so a cross-CLI diff here would assert nothing the register does not already state.",

	// ---- argv Node does not accept ----
	"import-media-invalid-archive": "argv is not valid for Node: `import media --skip-confirmation` " +
		"exits 1 with `The option \"skip-confirmation\" is unknown` (observed). The flag is " +
		"vip-next-only surface (register §5), so the differential would compare a working " +
		"command against a usage error.",
	"import-media-url-completed": "same as import-media-invalid-archive — carries " +
		"--skip-confirmation, which Node rejects at parse time.",

	// ---- poll cost / non-terminating fixtures ----
	"import-media-status-completed": "two blockers at once. (1) Same `App` operationName " +
		"collision as import-sql-status-no-job — Node's media poll is `query App($appId: Int, " +
		"$envId: Int)` at src/lib/media-import/status.ts:31. (2) Node's progress table repaints " +
		"every 200ms (src/lib/media-import/progress.ts:7) with no non-TTY guard, so stdout is a " +
		"stream of cursor escapes whose COUNT depends on wall-clock timing; a byte diff against " +
		"that measures scheduler luck, not parity.",
	"import-media-status-failed": "same `App` collision and same non-deterministic 200ms " +
		"progress repaint as import-media-status-completed.",
	"import-sql-status-completed": "same `App` collision (src/lib/site-import/status.ts:28), " +
		"plus a repainting progress table on a 5s poll — the frame count, and therefore stdout, " +
		"depends on how long the mock takes to answer.",
	"import-sql-status-no-job": "operationName collision the mux cannot resolve: Node's status " +
		"poll is ALSO called `App` (src/lib/site-import/status.ts:28, `query App($appId: Int, " +
		"$envId: Int)`) — the same name as the wrapper's app resolution (src/lib/api/app.ts:46). " +
		"Routing on operationName alone sends both to resolve-app.json. Disambiguating needs " +
		"variable-shape routing ($name/$id vs $appId+$envId) plus a Node-shaped " +
		"data.app.environments[].jobs fixture. Tractable, but it is new mux machinery rather " +
		"than a fixture tweak, so it is deferred rather than guessed at.",

	// ---- prompts that cannot be driven identically ----
	"import-sql-noninteractive-abort": "the scenario turns on VIP_NON_INTERACTIVE=1, which Node " +
		"does not consult outside src/lib/rechallenge/flow.ts and " +
		"src/lib/defensive-mode/cli-helpers.ts. Node instead renders an enquirer prompt whose " +
		"promise never settles on a non-TTY stdin, drains the event loop and exits 0 without " +
		"running the handler. Comparing that against vip-next's explicit non-interactive " +
		"refusal compares two different questions.",
	"import-media-abort-noninteractive": "same VIP_NON_INTERACTIVE=1 mismatch as " +
		"import-sql-noninteractive-abort; Node has no non-interactive mode for this prompt.",
	"import-sql-validation-failure": "Node runs its SQL validation INSIDE the interactive " +
		"import flow, after the enquirer prompt that never settles on a non-TTY stdin, so the " +
		"validation report is never reached. The equivalent Node-reachable assertion is " +
		"import-validate-sql-dangerous-stmt, which IS converted.",

	// ---- help renderers ----
	"backup-db-help": "help text is produced by a different renderer on each side (commander " +
		"vs cobra) and diverges completely by construction — different usage line, different " +
		"option table, Node appends an Examples section vip-next has no equivalent for. " +
		"See the report: this is a real, UNRECORDED divergence (register §3 documents the " +
		"--version format change but says nothing about --help), and converting all four " +
		"*-help scenarios would add four copies of one finding. Left unconverted; the " +
		"divergence is reported with exact output instead.",
	"export-sql-help":   "same renderer divergence as backup-db-help.",
	"import-sql-help":   "same renderer divergence as backup-db-help.",
	"import-media-help": "same renderer divergence as backup-db-help.",

	// ---- mutating flows whose fixtures do not describe one world ----
	"backup-db-completed": "the recording drives backup-status-N.json off a per-handler " +
		"sequence counter, and the two CLIs issue a different NUMBER of status queries for " +
		"the same flow (Node re-fetches once more after the poll, src/commands/backup-db.ts:218). " +
		"Sequenced fixtures indexed by call count therefore hand the two CLIs different " +
		"worlds. Needs state-based fixtures (respond by job state, not by call number) before " +
		"it can be a differential.",
	"export-sql-completed": "same call-count-indexed sequencing problem as backup-db-completed, " +
		"and Node additionally requires job metadata (`backupId` matching latestBackup.id, and " +
		"`bytesWritten`) that the recording does not carry — absent, Node throws " +
		"`Export job metadata does not contain bytesWritten` (src/commands/export-sql.ts:412).",
	"app-deploy-completed": "Node's custom-deploy upload path signs and PUTs the archive to a " +
		"presigned URL derived from the response; the mock's presign endpoint is written for " +
		"vip-next's request shape only. Converting needs Node's upload contract mirrored " +
		"first — a real piece of work, not a fixture tweak.",
	"sync-baseline": "argv is not valid for Node: `vip @app.env sync --skip-confirmation` exits " +
		"1 with `The option \"skip-confirmation\" is unknown` (observed). Node's confirmation " +
		"gate is `requireConfirm`, which registers `--force` and nothing else " +
		"(src/bin/vip-sync.js:25); vip-next accepts both spellings (register 2.7). Converting " +
		"means a Node-valid argv, and then Node's ~1s repainting progress renderer " +
		"(src/bin/vip-sync.js:114) still has to be dealt with.",
	"sync-already-syncing": "same `--skip-confirmation` rejection as sync-baseline.",

	// ---- transport the harness cannot stand up ----
	"wp-ssh-happy": "`vip wp` needs a live SSH/WebSocket transport, not GraphQL. The scenario " +
		"stands up an in-process echo server that speaks vip-next's exec preamble; Node would " +
		"need the same server to speak ITS protocol, which is a separate fake to build. Out of " +
		"reach for this pass.",
	"wp-websocket-redirect": "asserts vip-next's deliberate 'requires the Node CLI' redirect " +
		"(register §3). Node has no such redirect — it just runs the command — so the two " +
		"implementations are not answering the same question and a diff is meaningless.",
	"wp-nodejs-rejected": "needs the same wp transport fake as wp-ssh-happy before Node can " +
		"reach the environment-type gate.",
	"wp-production-confirm-decline": "combines the wp transport problem with the " +
		"VIP_NON_INTERACTIVE mismatch (Node does not consult it for this prompt).",
	"wp-help": "`vip help wp` is vip-next surface: `help` as a subcommand is listed in " +
		"register §4 as new in vip-next. Node has no `vip help <cmd>` form.",

	// ---- rechallenge ----
	"defensive-mode-enable-with-rechallenge": "trunk DOES have src/lib/rechallenge/, " +
		"src/lib/defensive-mode/ and four vip-defensive-mode-* bins, so the review's " +
		"'Go-only' claim was wrong and a differential is feasible IN PRINCIPLE. It is not " +
		"feasible from this scenario: the argv carries --skip-confirmation and " +
		"--non-interactive (both vip-next-only, register §4) and VIP_RECHALLENGE_WAIT, and " +
		"Node's step-up flow opens a verification URL and polls a session the mock does not " +
		"implement for Node's contract. Converting it means building a Node-shaped " +
		"rechallenge mock first — worth doing, out of scope here.",
}

// TestSurfaceDifferentialParity runs every convertible non-M5 scenario as a
// real Node-vs-Go differential.
func TestSurfaceDifferentialParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestSurfaceDifferentialParity — the non-M5 Node-vs-Go differentials", skip))
	}

	names := make([]string, 0, len(surfaceDifferentialScenarios))
	for name := range surfaceDifferentialScenarios {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		c := surfaceDifferentialScenarios[name]
		// No t.Parallel: subtests swap the shared server's handler.
		t.Run(name, func(t *testing.T) {
			path := "../../testdata/parity/" + name + ".yaml"
			scenario, err := LoadScenario(path)
			if err != nil {
				t.Fatalf("LoadScenario(%s): %v", path, err)
			}
			scenario.Env = rig.scenarioEnv(scenario)

			nodeRes, nodeHits := rig.runSide(t, scenario, rig.nodeBin, c.mux)
			goRes, goHits := rig.runSide(t, scenario, rig.goBin, c.mux)

			// Wire-level assertions run per binary, against that binary's own
			// counters, so "must not fire" cannot be satisfied by the other CLI
			// having behaved.
			assertHits(t, "node", c.wantHits, nodeHits)
			assertHits(t, "go", c.wantHits, goHits)

			d, err := Diff(scenario, nodeRes, goRes)
			if err != nil {
				t.Fatalf("Diff(%s): %v", name, err)
			}
			if d.Equal {
				if scenario.ExpectedDrift != nil {
					t.Errorf("%s carries expected_drift (%s) but Node and Go now agree. "+
						"Delete the annotation.", name, scenario.ExpectedDrift.Reason)
				}
				return
			}

			report := "Node (a) vs Go (b) diverge (argv: %v):\n  %s\n  %s\n  %s"
			if scenario.ExpectedDrift != nil {
				fmt.Fprintf(os.Stderr, "parity: BLESSED DRIFT %s — %s\n",
					name, strings.Join(strings.Fields(scenario.ExpectedDrift.Reason), " "))
				t.Logf("BLESSED DRIFT — "+scenario.ExpectedDrift.Reason+"\n"+report,
					scenario.Argv, d.ExitCodeDelta, d.StdoutDelta, d.StderrDelta)
				return
			}
			t.Errorf(report, scenario.Argv, d.ExitCodeDelta, d.StdoutDelta, d.StderrDelta)
		})
	}
}

// runSide installs a fresh mux, runs one binary against it, and restores the
// previous handler. See surfaceMuxFactory for why the mux is per-side.
func (r *differentialRig) runSide(
	t *testing.T, s *Scenario, bin string, mk surfaceMuxFactory,
) (*RunResult, map[string]int32) {
	t.Helper()
	h, hits := mk(t, s.Recording)
	previous := r.handler.Load()
	r.handler.Store(&h)
	defer r.handler.Store(previous)

	res, err := Run(RunSpec{Binary: bin, Argv: s.Argv, Env: FixtureEnv(s.Env)})
	if err != nil {
		t.Fatalf("run %s (%s): %v", bin, s.Name, err)
	}
	return res, hits()
}

func assertHits(t *testing.T, side string, want, got map[string]int32) {
	t.Helper()
	ops := make([]string, 0, len(want))
	for op := range want {
		ops = append(ops, op)
	}
	sort.Strings(ops)
	for _, op := range ops {
		if got[op] != want[op] {
			t.Errorf("%s: %s fired %d times, want %d", side, op, got[op], want[op])
		}
	}
}

// TestEverySurfaceScenarioIsClassified is the anti-drift guard for everything
// M5's own guard does not cover. Together the two account for every YAML in
// testdata/parity/.
//
// Without it, adding a scenario produces one more Go-vs-mock test that looks
// like parity coverage and is not — which is precisely the state this file was
// written to end.
func TestEverySurfaceScenarioIsClassified(t *testing.T) {
	entries, err := filepath.Glob("../../testdata/parity/*.yaml")
	if err != nil {
		t.Fatalf("glob yaml: %v", err)
	}

	var seen int
	for _, path := range entries {
		base := strings.TrimSuffix(filepath.Base(path), ".yaml")
		if isM5Scenario(base) {
			continue // m5_differential_test.go owns these
		}
		seen++
		if _, ok := surfaceDifferentialScenarios[base]; ok {
			continue
		}
		if reason, ok := surfaceDifferentialExclusions[base]; ok {
			if strings.TrimSpace(reason) == "" {
				t.Errorf("%s is excluded from the differential with an empty reason", base)
			}
			continue
		}
		t.Errorf("scenario %s runs against the mock only. Add it to "+
			"surfaceDifferentialScenarios, or to surfaceDifferentialExclusions with a "+
			"reason saying why Node cannot run it.", base)
	}
	if seen == 0 {
		t.Fatal("no non-M5 scenarios found — testdata may have moved")
	}
}

// TestSurfaceClassificationIsExclusive keeps the two maps from disagreeing: a
// scenario that is both converted and excluded would silently run while
// carrying a written reason why it cannot, which is worse than either.
func TestSurfaceClassificationIsExclusive(t *testing.T) {
	for name := range surfaceDifferentialScenarios {
		if reason, ok := surfaceDifferentialExclusions[name]; ok {
			t.Errorf("%s is in BOTH surfaceDifferentialScenarios and "+
				"surfaceDifferentialExclusions (%q)", name, reason)
		}
	}
	// An exclusion for a scenario that no longer exists is a stale reason
	// nobody will ever re-examine.
	for name := range surfaceDifferentialExclusions {
		if _, err := os.Stat("../../testdata/parity/" + name + ".yaml"); err != nil {
			t.Errorf("surfaceDifferentialExclusions names %s, which has no YAML", name)
		}
	}
}
