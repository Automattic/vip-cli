package proxy

import (
	"context"
	"testing"
)

// scriptRunner returns scripted results per docker subcommand for control-flow
// tests. runErrs is consumed in order for each `run` call (nil = success).
type scriptRunner struct {
	running bool    // result for IsRunning's inspect
	runErrs []error // sequential results for `run` calls
	calls   [][]string
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
	case len(args) >= 2 && args[0] == "inspect":
		if s.running {
			return nil
		}
		return errDocker
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
