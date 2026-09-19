package commands

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"github.com/Khan/genqlient/graphql"
	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/appctx"
)

func TestParseImportHeaders(t *testing.T) {
	hs, err := parseImportHeaders([]string{"Authorization: Bearer x", "X-Empty:"})
	if err != nil {
		t.Fatal(err)
	}
	if hs[0].Name != "Authorization" || hs[0].Value != "Bearer x" {
		t.Errorf("h0 = %+v", hs[0])
	}
	if hs[1].Name != "X-Empty" || hs[1].Value != "" {
		t.Errorf("h1 = %+v", hs[1])
	}

	_, err = parseImportHeaders([]string{"NoColonHere"})
	if err == nil || !strings.Contains(err.Error(), `Invalid header format: "NoColonHere". Expected format: "Name: Value"`) {
		t.Errorf("err = %v", err)
	}
	_, err = parseImportHeaders([]string{": value-only"})
	if err == nil || !strings.Contains(err.Error(), "Header name cannot be empty.") {
		t.Errorf("err = %v", err)
	}
}

// Node builds the wire pairs with
//
//	pair.split( ',' ).map( str => str.trim() )   // vip-import-sql.js:821
//	{ from: arr[0], to: arr[1] }                 // vip-import-sql.js:823-827
//
// JS String.split(',') with no limit splits on EVERY comma, so only the
// first two segments survive — "a,b,c" yields {from:"a", to:"b"} and "c" is
// silently dropped. Go's strings.SplitN(pair, ",", 2) instead glued the
// remainder onto `to` ("b,c"), i.e. a different server-side replacement.
func TestParseImportSearchReplacePairSplitsOnFirstCommaOnly(t *testing.T) {
	got := parseImportSearchReplacePair("a,b,c")
	if got.From != "a" {
		t.Errorf("From = %q, want %q", got.From, "a")
	}
	if got.To != "b" {
		t.Errorf("To = %q, want %q (Node discards everything after the 2nd segment)", got.To, "b")
	}
	if !got.HasTo {
		t.Error("HasTo = false, want true")
	}
}

// The destructive one. `--search-replace="a"` gives arr[1] === undefined in
// Node, and JSON.stringify drops undefined properties, so the wire payload
// is {from:"a"} with NO `to` key. Go sent to:"" — which instructs the server
// to replace every occurrence of "a" with the empty string, i.e. delete it.
func TestParseImportSearchReplacePairOmitsToWhenNoComma(t *testing.T) {
	got := parseImportSearchReplacePair("a")
	if got.From != "a" {
		t.Errorf("From = %q, want %q", got.From, "a")
	}
	if got.HasTo {
		t.Error("HasTo = true, want false — Node omits `to` entirely; sending to:\"\" deletes every occurrence of `from`")
	}
}

func TestParseImportSearchReplacePairTrimsSegments(t *testing.T) {
	got := parseImportSearchReplacePair("  from.example.com , to.example.com  ")
	if got.From != "from.example.com" || got.To != "to.example.com" {
		t.Errorf("got {%q,%q}, want {from.example.com,to.example.com}", got.From, got.To)
	}
}

// A trailing comma DOES produce a second (empty) segment in JS, so
// "a," legitimately means "replace a with nothing".
func TestParseImportSearchReplacePairTrailingCommaKeepsEmptyTo(t *testing.T) {
	got := parseImportSearchReplacePair("a,")
	if !got.HasTo || got.To != "" {
		t.Errorf("got {To:%q, HasTo:%v}, want {To:\"\", HasTo:true}", got.To, got.HasTo)
	}
}

// The wire payload is where the damage happens: `to` must be absent from
// the JSON, not null and not "".
func TestImportSearchReplaceWirePayloadOmitsMissingTo(t *testing.T) {
	pairs := buildImportSearchReplaceInput([]string{"a", "x,y,z"})
	b, err := json.Marshal(pairs)
	if err != nil {
		t.Fatal(err)
	}
	got := string(b)
	if strings.Contains(got, `"to":""`) {
		t.Errorf(`payload contains "to":"" — that deletes every occurrence of "a"; got %s`, got)
	}
	if strings.Contains(got, `"to":null`) {
		t.Errorf(`payload contains "to":null — Node omits the key entirely; got %s`, got)
	}
	if !strings.Contains(got, `{"from":"a"}`) {
		t.Errorf(`want the no-comma pair to serialize as {"from":"a"}; got %s`, got)
	}
	if !strings.Contains(got, `"to":"y"`) {
		t.Errorf(`want "x,y,z" to serialize with to:"y"; got %s`, got)
	}
}

// Node's sql.ts:1 imports `{ stdout as log } from '@wwa/single-line-log'`, so
// `log('Reading line N ')` (sql.ts:533) REWRITES the current line — the user
// sees one counter ticking up. Go printed a fresh newline-terminated line
// every 500 rows, so a 5M-line dump scrolled ~10,000 "Reading line N" lines
// past the actual validation findings.
func TestImportLineTickerOverwritesInsteadOfAppending(t *testing.T) {
	var buf bytes.Buffer
	tk := newImportLineTicker(&buf, true)
	for _, n := range []int{500, 1000, 1500} {
		tk.tick(n)
	}
	tk.done()

	got := buf.String()
	// An in-place renderer emits cursor-movement escapes; an appending one
	// emits none.
	if !strings.Contains(got, "\x1b[") {
		t.Errorf("no ANSI cursor movement emitted — the ticker is appending, not overwriting: %q", got)
	}
	// Every counter value must not survive as its own standing line: the
	// erase sequences mean only the last frame is left on screen. Count the
	// bare occurrences that are NOT preceded by an erase.
	if n := strings.Count(got, "Reading line"); n != 3 {
		t.Fatalf("emitted %d frames, want 3", n)
	}
	if !strings.Contains(got, "Reading line 1500 ") {
		t.Errorf("last frame missing (note the Node-parity trailing space): %q", got)
	}
}

// Piped/CI output gets no cursor control from the ticker at all — writing
// 10,000 progress lines into a build log buries the validation report.
func TestImportLineTickerSilentOnNonTTY(t *testing.T) {
	var buf bytes.Buffer
	tk := newImportLineTicker(&buf, false)
	for n := 500; n <= 5000; n += 500 {
		tk.tick(n)
	}
	tk.done()
	if got := buf.String(); got != "" {
		t.Errorf("non-TTY ticker wrote %q, want no progress chrome", got)
	}
}

// Node's playbook (vip-import-sql.js:489-499) makes a three-way distinction
// that Go collapsed into one hard failure:
//
//	if ( siteArray === 'undefined' || ! siteArray ) {   // wpSitesSDS null
//	    console.log( chalk.yellowBright( 'Unable to determine …' ) );
//	    return;                                          // ← WARN AND PROCEED
//	} else if ( ! siteArray?.length ) {                  // nodes: []
//	    throw new Error( 'There were no sites in your multisite installation.' );
//	}
//
// `siteArray` is `selectedEnvironmentObj?.wpSitesSDS?.nodes`, so a null
// wpSitesSDS (or a null nodes) yields undefined → warn. Only a present,
// genuinely EMPTY node list is fatal. Hard-failing the null case bricks SQL
// import for any multisite whose site catalog the API declines to return.
func TestDisplayPlaybookWarnsAndProceedsWhenWPSitesUnknown(t *testing.T) {
	var buf bytes.Buffer
	err := displayPlaybook(&buf, "dump.sql", "example.com", "Production",
		appctx.App{Name: "app"}, false, true,
		[]string{"wp_options"}, nil, nil, false /* wpSitesKnown */)
	if err != nil {
		t.Fatalf("displayPlaybook = %v, want nil — Node warns and proceeds when wpSitesSDS is null", err)
	}
	if !strings.Contains(buf.String(), "Unable to determine the network sites affected by this import") {
		t.Errorf("missing Node's yellow warning; got:\n%s", buf.String())
	}
}

// The genuinely-empty case stays fatal, exactly as in Node.
func TestDisplayPlaybookErrorsWhenWPSitesKnownButEmpty(t *testing.T) {
	var buf bytes.Buffer
	err := displayPlaybook(&buf, "dump.sql", "example.com", "Production",
		appctx.App{Name: "app"}, false, true,
		[]string{"wp_options"}, nil, nil, true /* wpSitesKnown */)
	if err == nil || !strings.Contains(err.Error(), "There were no sites in your multisite installation.") {
		t.Fatalf("err = %v, want 'There were no sites in your multisite installation.'", err)
	}
}

// fetchImportEnvInfo must preserve the null-vs-empty distinction the
// playbook depends on; a flattened []importWPSite alone cannot express it.
func TestFetchImportEnvInfoDistinguishesNullFromEmptyWPSites(t *testing.T) {
	cases := []struct {
		name      string
		wpSitesJS string
		wantKnown bool
	}{
		{"null wpSitesSDS", `"wpSitesSDS":null`, false},
		{"null nodes", `"wpSitesSDS":{"nodes":null}`, false},
		{"empty nodes", `"wpSitesSDS":{"nodes":[]}`, true},
		{"populated nodes", `"wpSitesSDS":{"nodes":[{"id":1,"homeUrl":"https://a.example.com"}]}`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"data":{"app":{"id":1,"typeId":2,"environments":[{"id":2,"launched":false,` +
				`"primaryDomain":{"name":"example.com"},` +
				`"importStatus":{"importInProgress":false,"dbOperationInProgress":false},` +
				tc.wpSitesJS + `}]}}}`
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(body))
			}))
			defer srv.Close()

			client := graphql.NewClient(srv.URL+"/graphql", srv.Client())
			info, err := fetchImportEnvInfo(context.Background(), client, 1, 2)
			if err != nil {
				t.Fatalf("fetchImportEnvInfo: %v", err)
			}
			if info.WPSitesKnown != tc.wantKnown {
				t.Errorf("WPSitesKnown = %v, want %v", info.WPSitesKnown, tc.wantKnown)
			}
		})
	}
}

func TestIsValidImportURL(t *testing.T) {
	// Node isValidUrl (vip-import-sql.js:96): URL-parseable with a real
	// protocol; single drive letters (Windows paths) rejected.
	for in, want := range map[string]bool{
		"https://example.com/f.sql": true,
		"http://u:p@example.com/f":  true,
		`C:\dumps\file.sql`:         false,
		"./relative/file.sql":       false,
		"file.sql":                  false,
	} {
		if got := isValidImportURL(in); got != want {
			t.Errorf("isValidImportURL(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestIsValidMd5(t *testing.T) {
	if !isValidMd5("5d41402abc4b2a76b9719d911017c592") {
		t.Error("valid md5 rejected")
	}
	for _, bad := range []string{"", "xyz", "5d41402abc4b2a76b9719d911017c59", "5d41402abc4b2a76b9719d911017c592a"} {
		if isValidMd5(bad) {
			t.Errorf("%q accepted", bad)
		}
	}
}

func validGateInfo() *importEnvInfo {
	return &importEnvInfo{HasImportStatus: true}
}

func TestImportSQLGatesFileChecks(t *testing.T) {
	dir := t.TempDir()
	mk := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}

	okSQL := mk("good.sql", "SELECT 1;\n")
	badExt := mk("bad.txt", "SELECT 1;\n")
	badName := mk("bad name!.sql", "SELECT 1;\n")
	empty := mk("empty.sql", "")
	big := mk("big.sql", strings.Repeat("x", 100))

	cases := []struct {
		name string
		g    gateInput
		want string
	}{
		{"bad extension", gateInput{FileNameOrURL: badExt, AppTypeID: 2, Info: validGateInfo()},
			"Invalid file extension. Please provide a .sql or .gz file."},
		{"bad filename", gateInput{FileNameOrURL: badName, AppTypeID: 2, Info: validGateInfo()},
			"limited to [0-9,a-z,A-Z,-,_,.]"},
		{"missing file", gateInput{FileNameOrURL: filepath.Join(dir, "nope.sql"), AppTypeID: 2, Info: validGateInfo()},
			"does not exist or is not readable."},
		{"directory", gateInput{FileNameOrURL: dir + "/", AppTypeID: 2, Info: validGateInfo()},
			"does not exist or is not readable."}, // trailing slash fails basename charset? see below
		{"empty file", gateInput{FileNameOrURL: empty, AppTypeID: 2, Info: validGateInfo()},
			"is empty."},
		{"too big", gateInput{FileNameOrURL: big, AppTypeID: 2, Info: validGateInfo(), SizeLimit: 10, SizeLimitLaunched: 5},
			"exceeds the limit (10 bytes)."},
		{"too big launched", gateInput{FileNameOrURL: big, AppTypeID: 2, Info: validGateInfo(), Launched: true, SizeLimit: 10, SizeLimitLaunched: 5},
			"This limit is lower for launched environments"},
		{"invalid md5", gateInput{FileNameOrURL: "https://x.example/f.sql", IsURL: true, Md5: "nope", AppTypeID: 2, Info: validGateInfo()},
			"The provided MD5 hash is invalid. It should be a 32-character hexadecimal string."},
		{"unsupported app", gateInput{FileNameOrURL: okSQL, AppTypeID: 3, Info: validGateInfo()},
			"does not currently support SQL imports."},
		{"no import status", gateInput{FileNameOrURL: okSQL, AppTypeID: 2, Info: &importEnvInfo{}},
			"Could not determine the import status for this environment."},
		{"import in progress", gateInput{FileNameOrURL: okSQL, AppTypeID: 2,
			Info: &importEnvInfo{HasImportStatus: true, ImportInProgress: true}},
			"There is already an import in progress."},
		{"dbop in progress", gateInput{FileNameOrURL: okSQL, AppTypeID: 2,
			Info: &importEnvInfo{HasImportStatus: true, DbOperationInProgress: true}},
			"There is already a database operation in progress. Please try again later."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tc.g.Out = io.Discard
			err := importSQLGates(tc.g)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want substring %q", err, tc.want)
			}
		})
	}

	t.Run("clean local file passes", func(t *testing.T) {
		err := importSQLGates(gateInput{FileNameOrURL: okSQL, AppTypeID: 2, Info: validGateInfo(), Out: io.Discard})
		if err != nil {
			t.Errorf("err = %v", err)
		}
	})

	t.Run("md5 ignored warning for local file", func(t *testing.T) {
		t.Setenv("NO_COLOR", "1")
		var buf bytes.Buffer
		err := importSQLGates(gateInput{FileNameOrURL: okSQL, AppTypeID: 2, Info: validGateInfo(),
			Md5: "5d41402abc4b2a76b9719d911017c592", Out: &buf})
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if !strings.Contains(buf.String(), "The --md5 parameter is only valid for imports from a remote URL. This option will be ignored.") {
			t.Errorf("missing ignore warning: %q", buf.String())
		}
	})
}

// importStub serves the GraphQL operations + presign + S3 endpoints the
// full import flow touches.
type importStub struct {
	mu             sync.Mutex
	startImportReq string
	uploadedBody   []byte
	srvURL         string
}

func (s *importStub) start(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	s.srvURL = srv.URL

	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"ImportSQLEnvInfo"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"parityapp","typeId":2,"environments":[
				{"id":7,"appId":42,"type":"develop","name":"develop","launched":false,"isK8sResident":true,
				 "primaryDomain":{"name":"example.com"},
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false},
				 "wpSitesSDS":{"nodes":[]}}]}}}`))
		case strings.Contains(bs, `"operationName":"AppMultiSiteCheck"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"parityapp","repo":"r","environments":[
				{"id":7,"appId":42,"name":"develop","type":"develop","isMultisite":false,"isSubdirectoryMultisite":false}]}}}`))
		case strings.Contains(bs, `"operationName":"StartImport"`):
			s.mu.Lock()
			s.startImportReq = bs
			s.mu.Unlock()
			_, _ = w.Write([]byte(`{"data":{"startImport":{"app":{"id":42,"name":"parityapp"},"message":"ok","success":true}}}`))
		case strings.Contains(bs, `"operationName":"ImportSQLProgress"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[
				{"id":7,"isK8sResident":true,"launched":false,
				 "jobs":[{"__typename":"Job","id":1,"type":"sql_import",
					"createdAt":"Mon, 01 Jun 2026 00:00:00 UTC","completedAt":"Mon, 01 Jun 2026 00:05:00 UTC",
					"progress":{"status":"success","steps":[
						{"id":"import","name":"Importing db","status":"success"}]}}],
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false,"progress":null}}]}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	mux.HandleFunc("/upload/site-import-presigned-url", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"url":"%s/s3target","options":{"method":"PUT","headers":{}}}`, s.srvURL)
	})
	mux.HandleFunc("/s3target", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		s.mu.Lock()
		s.uploadedBody = body
		s.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	})
	return srv
}

// cleanWPDump satisfies every required static check (dropTable,
// createTable, autoIncrement, engineInnoDB) — same shape as the
// validate-sql clean fixture.
const cleanWPDump = "DROP TABLE IF EXISTS `wp_posts`;\n" +
	"CREATE TABLE `wp_posts` (\n" +
	"  `ID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n" +
	"  PRIMARY KEY (`ID`)\n" +
	") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n"

// multisiteWPDump adds a wp_blogs table so IsMultiSiteSQLDumpLine fires
// while the static checks still pass.
const multisiteWPDump = cleanWPDump +
	"DROP TABLE IF EXISTS `wp_blogs`;\n" +
	"CREATE TABLE `wp_blogs` (\n" +
	"  `blog_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n" +
	"  PRIMARY KEY (`blog_id`)\n" +
	") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n"

func importCtx(appID, envID, typeID int64) context.Context {
	return appctx.WithAppEnv(context.Background(), &appctx.AppEnv{
		App: appctx.App{ID: appID, Name: "parityapp", TypeId: typeID},
		Env: appctx.Env{ID: envID, Name: "develop", Type: "develop"},
	})
}

// stubImportPrompts redirects the prompt indirection vars; restore via
// the returned func.
func stubImportPrompts(inputAnswer string, confirmAnswer bool) func() {
	origInput := importInputPrompt
	origConfirm := importConfirmPrompt
	importInputPrompt = func(_ *cobra.Command, _ string, _ string) (string, error) {
		return inputAnswer, nil
	}
	importConfirmPrompt = func(_ *cobra.Command, _ string, _ bool) (bool, error) {
		return confirmAnswer, nil
	}
	return func() {
		importInputPrompt = origInput
		importConfirmPrompt = origConfirm
	}
}

func TestImportSQLHappyPathUploadsOriginalFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("go-search-replace stand-in is a POSIX #!/bin/sh script; not executable on Windows")
	}
	stub := &importStub{}
	srv := stub.start(t)
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL,
		Token:     "tok",
	})
	defer SetConfig(Config{})

	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_IMPORT_SQL_INTERVAL_MS", "1")
	restore := stubImportPrompts("EXAMPLE.COM", true)
	defer restore()

	// Fake search-replace binary upper-cases its input; if the command
	// wrongly uploaded the s-r output, the uploaded body would be
	// upper-case.
	binDir := t.TempDir()
	bin := filepath.Join(binDir, "go-search-replace")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\ntr 'a-z' 'A-Z'\n"), 0o755); err != nil { // #nosec G306
		t.Fatal(err)
	}
	t.Setenv("VIP_SEARCH_REPLACE_BIN", bin)

	dir := t.TempDir()
	sqlPath := filepath.Join(dir, "dump.sql")
	content := cleanWPDump
	if err := os.WriteFile(sqlPath, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	outPath := filepath.Join(dir, "replaced.sql")

	cmd := ImportSQLCmd()
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(importCtx(42, 7, 2))
	_ = cmd.Flags().Set("search-replace", "from.example.com,to.example.com")
	_ = cmd.Flags().Set("output", outPath)

	if err := runImportSQL(cmd, []string{sqlPath}); err != nil {
		t.Fatalf("runImportSQL: %v\nstdout: %s\nstderr: %s", err, stdout.String(), stderr.String())
	}

	stub.mu.Lock()
	defer stub.mu.Unlock()
	// fileNameToUpload trap (vip-import-sql.js:630): the ORIGINAL file is
	// uploaded, not the --output copy.
	if string(stub.uploadedBody) != content {
		t.Errorf("uploaded body = %q, want original content", stub.uploadedBody)
	}
	if !strings.Contains(stub.startImportReq, `"basename":"dump.sql"`) {
		t.Errorf("StartImport input missing basename: %s", stub.startImportReq)
	}
	if !strings.Contains(stub.startImportReq, `"searchReplace":[{"from":"from.example.com","to":"to.example.com"}]`) {
		t.Errorf("StartImport input missing searchReplace pairs: %s", stub.startImportReq)
	}
	// The --output copy was still produced by the replace step.
	replaced, err := os.ReadFile(outPath) // #nosec G304
	if err != nil {
		t.Fatalf("output copy missing: %v", err)
	}
	if !strings.Contains(string(replaced), "CREATE TABLE `WP_POSTS`") {
		t.Errorf("replaced copy = %q", replaced)
	}
	// Playbook + table list went to stdout.
	if !strings.Contains(stdout.String(), "importing: "+sqlPath) {
		t.Errorf("stdout missing playbook: %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "wp_posts") {
		t.Errorf("stdout missing table names: %q", stdout.String())
	}
}

func TestImportSQLDomainPromptMismatchAborts(t *testing.T) {
	stub := &importStub{}
	srv := stub.start(t)
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL,
		Token:     "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")
	restore := stubImportPrompts("WRONG.DOMAIN", true)
	defer restore()

	dir := t.TempDir()
	sqlPath := filepath.Join(dir, "dump.sql")
	if err := os.WriteFile(sqlPath, []byte(cleanWPDump), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := ImportSQLCmd()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	err := runImportSQL(cmd, []string{sqlPath})
	if err == nil || !strings.Contains(err.Error(), "The input did not match the expected environment label. Import aborted.") {
		t.Errorf("err = %v", err)
	}
	stub.mu.Lock()
	defer stub.mu.Unlock()
	if stub.startImportReq != "" {
		t.Error("StartImport must not fire after an aborted prompt")
	}
}

func TestImportSQLMultisiteMismatchErrors(t *testing.T) {
	// Single-site env + multisite dump → site-type validation error.
	stub := &importStub{}
	srv := stub.start(t)
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL,
		Token:     "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")
	restore := stubImportPrompts("EXAMPLE.COM", true)
	defer restore()

	dir := t.TempDir()
	sqlPath := filepath.Join(dir, "ms.sql")
	if err := os.WriteFile(sqlPath, []byte(multisiteWPDump), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := ImportSQLCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	err := runImportSQL(cmd, []string{sqlPath})
	if err == nil || !strings.Contains(err.Error(), "You have provided a multisite SQL dump file for import into a single site (non-multisite).") {
		t.Errorf("err = %v", err)
	}
}

func TestImportSQLStatusUnsupportedApp(t *testing.T) {
	cmd := ImportSQLStatusCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 3)) // typeId 3 = NodeJS, unsupported

	err := runImportSQLStatus(cmd, nil)
	if err == nil || !strings.Contains(err.Error(), "does not currently support SQL imports.") {
		t.Errorf("err = %v", err)
	}
}

func TestImportSQLStatusNoJobFastReturn(t *testing.T) {
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	defer srv.Close()
	mux.HandleFunc("/graphql", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(bs, `"operationName":"ImportSQLEnvInfo"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"id":42,"name":"parityapp","typeId":2,"environments":[
				{"id":7,"appId":42,"type":"develop","name":"develop","launched":false,"isK8sResident":true,
				 "primaryDomain":{"name":"example.com"},
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false},
				 "wpSitesSDS":{"nodes":[]}}]}}}`))
		case strings.Contains(bs, `"operationName":"ImportSQLProgress"`):
			_, _ = w.Write([]byte(`{"data":{"app":{"environments":[
				{"id":7,"isK8sResident":true,"launched":false,"jobs":[],
				 "importStatus":{"dbOperationInProgress":false,"importInProgress":false,"progress":null}}]}}}`))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	})
	SetConfig(Config{
		GQLClient: graphql.NewClient(srv.URL+"/graphql", srv.Client()),
		APIHost:   srv.URL,
		Token:     "tok",
	})
	defer SetConfig(Config{})
	t.Setenv("NO_COLOR", "1")
	t.Setenv("VIP_IMPORT_SQL_INTERVAL_MS", "1")

	cmd := ImportSQLStatusCmd()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetContext(importCtx(42, 7, 2))

	if err := runImportSQLStatus(cmd, nil); err != nil {
		t.Errorf("no-job fast return must exit clean, got %v", err)
	}
}

// Node applies --search-replace TWICE when --in-place is used on a local file,
// and vip-next inherited it. The mechanism (verified against trunk):
//
//   - vip-import-sql.js:577 sets `fileNameToUpload = fileNameOrURL` BEFORE the
//     search-replace block at :671, and never reassigns it.
//   - Without --in-place the rewritten copy is therefore discarded and the
//     ORIGINAL is uploaded, so the server pass at :760 is the only one. Correct.
//   - With --in-place the original file itself was rewritten on disk, so the
//     upload already carries replaced content -- and :760 is NOT gated on
//     isUrl, so the server applies the same pairs a second time.
//
// Idempotent for a domain swap (the second pass matches nothing), compounding
// for a pair like a -> aa, which yields aaaa. That is silent data corruption,
// so vip-next deliberately diverges: send the pairs only when the uploaded
// bytes have NOT already been rewritten.
func TestServerSideSearchReplaceSkippedWhenUploadAlreadyRewritten(t *testing.T) {
	pairs := []string{"a,aa"}
	tests := []struct {
		name    string
		isURL   bool
		inPlace bool
		pairs   []string
		want    bool
	}{
		{
			name: "local + --in-place: upload already rewritten, server must NOT repeat",
			isURL: false, inPlace: true, pairs: pairs, want: false,
		},
		{
			name: "local without --in-place: Node discards the rewritten copy and uploads the original, so the server pass is the only one",
			isURL: false, inPlace: false, pairs: pairs, want: true,
		},
		{
			name: "URL: no local pass is possible, server must apply",
			isURL: true, inPlace: false, pairs: pairs, want: true,
		},
		{
			name: "no pairs: nothing to send",
			isURL: false, inPlace: false, pairs: nil, want: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := serverSideSearchReplaceNeeded(tc.isURL, tc.inPlace, tc.pairs)
			if got != tc.want {
				t.Errorf("serverSideSearchReplaceNeeded(isURL=%v, inPlace=%v, pairs=%v) = %v, want %v",
					tc.isURL, tc.inPlace, tc.pairs, got, tc.want)
			}
		})
	}
}

// The local search-replace pass is only observable when it writes somewhere the
// user can see: --in-place (rewrites their file, and is the only thing that
// changes what gets uploaded) or an explicit --output (an inspectable artifact).
//
// Node runs it unconditionally for local files and then DISCARDS the result --
// `outputFileName` is destructured at vip-import-sql.js:674, type-checked at
// :681, and never referenced again -- because `fileNameToUpload` was already
// pinned to the original at :577. The server does the real replacement from the
// pairs in the StartImport payload. So on the default path Node reads and
// rewrites the entire dump to a temp file that nothing ever opens: on a 5 GB
// dump, 5 GB read and 5 GB written for nothing.
//
// Skipping it changes no imported bytes -- only cost.
func TestLocalSearchReplaceOnlyRunsWhenItsOutputIsObservable(t *testing.T) {
	pairs := []string{"old.com,new.com"}
	tests := []struct {
		name    string
		isURL   bool
		inPlace bool
		output  string
		pairs   []string
		want    bool
	}{
		{name: "--in-place: rewrites the user's file, and changes what is uploaded",
			isURL: false, inPlace: true, output: "", pairs: pairs, want: true},
		{name: "explicit --output: the user asked for the artifact",
			isURL: false, inPlace: false, output: "clean.sql", pairs: pairs, want: true},
		{name: "neither: Node writes a temp file and discards it, server does the work",
			isURL: false, inPlace: false, output: "", pairs: pairs, want: false},
		{name: "URL: Node never runs a local pass",
			isURL: true, inPlace: false, output: "", pairs: pairs, want: false},
		{name: "no pairs: nothing to replace",
			isURL: false, inPlace: false, output: "", pairs: nil, want: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := localSearchReplaceNeeded(tc.isURL, tc.inPlace, tc.output, tc.pairs)
			if got != tc.want {
				t.Errorf("localSearchReplaceNeeded(isURL=%v, inPlace=%v, output=%q, pairs=%v) = %v, want %v",
					tc.isURL, tc.inPlace, tc.output, tc.pairs, got, tc.want)
			}
		})
	}
}
