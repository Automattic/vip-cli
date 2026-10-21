package commands

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

// syncSeqStub responds with different bodies per operationName and per
// hit count. SyncProgress hits cycle through `progresses`; SyncEnvironment
// returns `syncStartBody` (or default).
type syncSeqStub struct {
	mu             sync.Mutex
	startHits      atomic.Int32
	progressHits   atomic.Int32
	syncStartBody  string
	progressBodies []string
}

func (s *syncSeqStub) start(_ *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		bs := string(body)
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.Contains(bs, `"operationName":"SyncEnvironment"`):
			s.startHits.Add(1)
			if s.syncStartBody == "" {
				_, _ = w.Write([]byte(`{"data":{"syncEnvironment":{"environment":{"id":7}}}}`))
				return
			}
			_, _ = w.Write([]byte(s.syncStartBody))
		case strings.Contains(bs, `"operationName":"SyncProgress"`):
			i := int(s.progressHits.Add(1) - 1)
			s.mu.Lock()
			defer s.mu.Unlock()
			if i >= len(s.progressBodies) {
				i = len(s.progressBodies) - 1
			}
			_, _ = w.Write([]byte(s.progressBodies[i]))
		default:
			_, _ = w.Write([]byte(`{"data":null}`))
		}
	}))
}

// TestSyncHappyPath drives runSync through the happy flow: mutation
// succeeds, then a "running" -> "success" status sequence. Verifies
// the banner + the terminal success line.
func TestSyncHappyPath(t *testing.T) {
	stub := &syncSeqStub{
		progressBodies: []string{
			`{"data":{"app":{"id":42,"environments":[
				{"id":7,"syncProgress":{"status":"running","sync":1,"steps":[
					{"name":"Backup","status":"running","step":"backup"}
				]}}
			]}}}`,
			`{"data":{"app":{"id":42,"environments":[
				{"id":7,"syncProgress":{"status":"success","sync":1,"steps":[
					{"name":"Backup","status":"success","step":"backup"}
				]}}
			]}}}`,
		},
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	// Tight poll interval so test finishes quickly.
	t.Setenv("VIP_SYNC_INTERVAL_MS", "1")
	t.Setenv("NO_COLOR", "1") // strip color escapes for stable substring asserts

	cmd := SyncCmd()
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runSync(cmd, nil); err != nil {
		t.Fatalf("runSync: %v", err)
	}
	out := stdout.String()
	if !strings.Contains(out, "syncing:") {
		t.Errorf("stdout missing banner; got %q", out)
	}
	if !strings.Contains(out, "Data Sync is finished") {
		t.Errorf("stdout missing terminal line; got %q", out)
	}
	if stub.startHits.Load() != 1 {
		t.Errorf("SyncEnvironment hits = %d, want 1", stub.startHits.Load())
	}
	if stub.progressHits.Load() < 2 {
		t.Errorf("SyncProgress hits = %d, want >= 2", stub.progressHits.Load())
	}
}

// TestSyncAlreadySyncing drives the path where SyncEnvironment returns
// the "Site is already syncing" GraphQL error: runSync should print the
// yellow Note and proceed to polling.
func TestSyncAlreadySyncing(t *testing.T) {
	stub := &syncSeqStub{
		syncStartBody: `{"data":null,"errors":[{"message":"Site is already syncing"}]}`,
		progressBodies: []string{
			`{"data":{"app":{"id":42,"environments":[
				{"id":7,"syncProgress":{"status":"success","sync":1,"steps":[]}}
			]}}}`,
		},
	}
	srv := stub.start(t)
	defer srv.Close()
	setupEnvvarConfig(srv)
	defer SetConfig(Config{})

	t.Setenv("VIP_SYNC_INTERVAL_MS", "1")
	t.Setenv("NO_COLOR", "1")

	cmd := SyncCmd()
	_ = cmd.Flags().Set("skip-confirmation", "true")
	var stdout, stderr bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetErr(&stderr)
	cmd.SetContext(ctxWithAppEnv(42, 7))

	if err := runSync(cmd, nil); err != nil {
		t.Fatalf("runSync: %v", err)
	}
	out := stdout.String()
	if !strings.Contains(out, "A data sync is already running") {
		t.Errorf("stdout must include already-running Note; got %q", out)
	}
	if !strings.Contains(out, "Data Sync is finished") {
		t.Errorf("stdout missing terminal line; got %q", out)
	}
	if stub.startHits.Load() != 1 {
		t.Errorf("SyncEnvironment hits = %d, want 1", stub.startHits.Load())
	}
	if stub.progressHits.Load() < 1 {
		t.Errorf("SyncProgress hits = %d, want >= 1", stub.progressHits.Load())
	}
}

// TestSyncCurrentStatuses drives runSync through the statuses the API
// reports today: the current step name while running (started,
// importing, cleanup), then complete / partially_completed / failed.
// Steps report finished instead of success.
func TestSyncCurrentStatuses(t *testing.T) {
	running := func(status, started, importing, cleanup string) string {
		return `{"data":{"app":{"id":42,"environments":[
			{"id":7,"syncProgress":{"status":"` + status + `","sync":1,"steps":[
				{"name":"started","status":"` + started + `"},
				{"name":"importing","status":"` + importing + `"},
				{"name":"cleanup","status":"` + cleanup + `"}
			]}}
		]}}}`
	}
	terminal := func(status, errMsg, cleanup string) string {
		return `{"data":{"app":{"id":42,"environments":[
			{"id":7,"syncProgress":{"status":"` + status + `","error":` + errMsg + `,"sync":1,"steps":[
				{"name":"started","status":"finished"},
				{"name":"importing","status":"finished"},
				{"name":"cleanup","status":"` + cleanup + `"}
			]}}
		]}}}`
	}
	inFlight := []string{
		running("started", "running", "pending", "pending"),
		running("importing", "finished", "running", "pending"),
		running("cleanup", "finished", "finished", "running"),
	}

	cases := []struct {
		name     string
		final    string
		want     []string
		notWant  []string
		minPolls int32
	}{
		{
			name:     "complete",
			final:    terminal("complete", "null", "finished"),
			want:     []string{"✓ cleanup", "✓ Data Sync is finished"},
			notWant:  []string{"Error:"},
			minPolls: 4,
		},
		{
			name:     "partially completed",
			final:    terminal("partially_completed", `"Search index refresh failed"`, "failed"),
			want:     []string{"✕ cleanup", "Data Sync is partially completed", "Error: Search index refresh failed"},
			minPolls: 4,
		},
		{
			name:     "failed",
			final:    terminal("failed", `"Import failed"`, "failed"),
			want:     []string{"✕ Data Sync failed", "Error: Import failed"},
			notWant:  []string{"Data Sync is finished"},
			minPolls: 4,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := &syncSeqStub{progressBodies: append(append([]string{}, inFlight...), tc.final)}
			srv := stub.start(t)
			defer srv.Close()
			setupEnvvarConfig(srv)
			defer SetConfig(Config{})

			t.Setenv("VIP_SYNC_INTERVAL_MS", "1")
			t.Setenv("NO_COLOR", "1")

			cmd := SyncCmd()
			_ = cmd.Flags().Set("skip-confirmation", "true")
			var stdout, stderr bytes.Buffer
			cmd.SetOut(&stdout)
			cmd.SetErr(&stderr)
			cmd.SetContext(ctxWithAppEnv(42, 7))

			if err := runSync(cmd, nil); err != nil {
				t.Fatalf("runSync: %v", err)
			}
			out := stdout.String()
			for _, w := range tc.want {
				if !strings.Contains(out, w) {
					t.Errorf("stdout missing %q; got %q", w, out)
				}
			}
			for _, w := range tc.notWant {
				if strings.Contains(out, w) {
					t.Errorf("stdout must not contain %q; got %q", w, out)
				}
			}
			// The in-flight statuses must not end the poll early.
			if got := stub.progressHits.Load(); got < tc.minPolls {
				t.Errorf("SyncProgress hits = %d, want >= %d", got, tc.minPolls)
			}
		})
	}
}
