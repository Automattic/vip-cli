//go:build parity

package parity

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestLogFollowLargeDelayDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("large log-follow delay differential", skip))
	}
	page, err := os.ReadFile("../../testdata/parity/recordings/logs-follow-delay-overflow/logs.json")
	if err != nil {
		t.Fatal(err)
	}
	scenario := &Scenario{
		Argv: []string{"@parityapp.develop", "logs", "--follow", "--format=json"},
		Env:  map[string]string{"DO_NOT_TRACK": "1", "NODE_ENV": "test", "NO_COLOR": "1"},
	}
	// Use Node's published leaf bin so cancellation owns the polling process,
	// rather than only its synchronous root-command dispatcher.
	for _, side := range []struct {
		name, binary string
		argv         []string
	}{
		{"node", filepath.Join(filepath.Dir(rig.nodeBin), "vip-logs.js"), []string{"@parityapp.develop", "--follow", "--format=json"}},
		{"go", rig.goBin, scenario.Argv},
	} {
		t.Run(side.name, func(t *testing.T) {
			var requests atomic.Int32
			first := make(chan struct{})
			fallback := m5Mux(t, "logs-format-json")
			rig.serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					http.Error(w, "cannot read request", http.StatusBadRequest)
					return
				}
				var operation struct {
					OperationName string `json:"operationName"`
				}
				if json.Unmarshal(body, &operation) == nil && operation.OperationName == "GetAppLogs" {
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write(page)
					if requests.Add(1) == 1 {
						close(first)
					}
					return
				}
				r.Body = io.NopCloser(bytes.NewReader(body))
				fallback.ServeHTTP(w, r)
			}))
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			cmd := exec.CommandContext(ctx, side.binary, side.argv...)
			cmd.WaitDelay = time.Second
			cmd.Env = FixtureEnv(rig.scenarioEnv(scenario))
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			if err := cmd.Start(); err != nil {
				cancel()
				t.Fatal(err)
			}
			done := make(chan struct{})
			go func() { _ = cmd.Wait(); close(done) }()
			defer func() { cancel(); <-done }()
			select {
			case <-first:
			case <-done:
				t.Fatalf("CLI exited before fetching logs: %s", stderr.String())
			case <-ctx.Done():
				t.Fatal("CLI did not fetch logs before the deadline")
			}
			// An overflowing Node timer becomes a 1 ms timer. Both real CLIs
			// must remain in their bounded sleep after rendering the first page.
			select {
			case <-time.After(time.Second):
			case <-done:
				t.Fatalf("CLI exited while following logs: %s", stderr.String())
			}
			cancel()
			<-done
			if !strings.Contains(stdout.String(), "delay-fixture-page") {
				t.Fatalf("first page was not rendered: stdout=%q stderr=%q", stdout.String(), stderr.String())
			}
			if got := requests.Load(); got != 1 {
				t.Errorf("received %d log requests in one second, want one bounded poll", got)
			}
		})
	}
}
