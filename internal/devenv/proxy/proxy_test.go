package proxy

import (
	"context"
	"testing"
)

// scriptRunner returns scripted results per docker subcommand for control-flow
// tests. runErrs is consumed in order for each `run` call (nil = success).
type scriptRunner struct {
	running bool    // proxy container exists and is running
	stopped bool    // proxy container exists but is stopped (orphan)
	runErrs []error // sequential results for `run` calls
	calls   [][]string
}

// DockerOut scripts `inspect -f {{.State.Running}}`: exit 0 with "true" or
// "false" when the container exists (running or stopped), error when absent.
func (s *scriptRunner) DockerOut(ctx context.Context, args ...string) ([]byte, error) {
	s.calls = append(s.calls, args)
	if len(args) > 0 && args[0] == "inspect" {
		switch {
		case s.running:
			return []byte("true\n"), nil
		case s.stopped:
			return []byte("false\n"), nil
		}
		return nil, errDocker
	}
	return nil, nil
}

func (s *scriptRunner) Docker(ctx context.Context, args ...string) error {
	s.calls = append(s.calls, args)
	switch {
	case len(args) > 0 && args[0] == "run":
		if len(s.runErrs) > 0 {
			e := s.runErrs[0]
			s.runErrs = s.runErrs[1:]
			return e
		}
		return nil
	}
	return nil
}

func TestEnsureRunsProxyAndPersistsPorts(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	r := &scriptRunner{running: false}
	free := func(int) bool { return true } // 80/443 free per probe
	got, err := Ensure(context.Background(), r, EnsureOptions{Domain: "vipdev.lndo.site", free: free})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if got.HTTP != 80 || got.HTTPS != 443 {
		t.Fatalf("expected default ports, got %+v", got)
	}
	persisted, _ := LoadPorts(PortsStatePath())
	if persisted != got {
		t.Fatalf("ports not persisted: %+v vs %+v", persisted, got)
	}
}

func TestEnsureNoopWhenAlreadyRunning(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if err := SavePorts(PortsStatePath(), Ports{HTTP: 8080, HTTPS: 4433}); err != nil {
		t.Fatal(err)
	}
	r := &scriptRunner{running: true}
	got, err := Ensure(context.Background(), r, EnsureOptions{Domain: "vipdev.lndo.site", free: func(int) bool { return true }})
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTP != 8080 || got.HTTPS != 4433 {
		t.Fatalf("already-running path should return persisted ports, got %+v", got)
	}
	for _, c := range r.calls {
		if len(c) > 0 && c[0] == "run" {
			t.Fatalf("should not run proxy when already running: %v", r.calls)
		}
	}
}

func TestEnsureRemovesStoppedOrphanThenStarts(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	// A stopped proxy container exists: inspect succeeds but prints "false".
	// Ensure must not treat it as running; it removes the orphan (docker rm
	// without -f) and starts a fresh proxy.
	r := &scriptRunner{stopped: true}
	got, err := Ensure(context.Background(), r, EnsureOptions{Domain: "vipdev.lndo.site", free: func(int) bool { return true }})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if got.HTTP != 80 || got.HTTPS != 443 {
		t.Fatalf("expected default ports, got %+v", got)
	}
	var sawRm, sawRun bool
	for _, c := range r.calls {
		switch {
		case len(c) == 2 && c[0] == "rm" && c[1] == ProxyContainerName:
			if sawRun {
				t.Fatalf("orphan must be removed before run: %v", r.calls)
			}
			sawRm = true
		case len(c) > 0 && c[0] == "run":
			sawRun = true
		}
	}
	if !sawRm || !sawRun {
		t.Fatalf("expected rm then run, got calls: %v", r.calls)
	}
}

func TestIsRunningReadsInspectOutput(t *testing.T) {
	ctx := context.Background()
	if IsRunning(ctx, &scriptRunner{running: true}) != true {
		t.Fatal("running container should report true")
	}
	if IsRunning(ctx, &scriptRunner{stopped: true}) {
		t.Fatal("stopped container must not report running")
	}
	if IsRunning(ctx, &scriptRunner{}) {
		t.Fatal("absent container must not report running")
	}
}

func TestEnsureRetriesNextPortOnBindFailure(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	// First run fails (port busy at bind time despite probe), second succeeds.
	r := &scriptRunner{running: false, runErrs: []error{errDocker, nil}}
	got, err := Ensure(context.Background(), r, EnsureOptions{Domain: "vipdev.lndo.site", free: func(int) bool { return true }})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	// After the http bind failed once, the next http candidate (8000) is used.
	if got.HTTP != 8000 {
		t.Fatalf("expected retry to 8000 after bind failure, got %+v", got)
	}
	// the failed name collision is cleaned up before retry
	var sawRm bool
	for _, c := range r.calls {
		if len(c) > 0 && c[0] == "rm" {
			sawRm = true
		}
	}
	if !sawRm {
		t.Fatalf("expected rm of partial proxy before retry: %v", r.calls)
	}
}
