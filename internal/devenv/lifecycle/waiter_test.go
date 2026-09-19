package lifecycle

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// fakeContainer is fakeDocker's internal record; ListContainers filters over it.
type fakeContainer struct {
	id, name, project string
	lando             bool
}

// fakeDocker scripts ComposePS results per poll and records Compose calls.
type fakeDocker struct {
	psQueue    [][]ServiceState
	psErr      error
	calls      [][]string
	volumes    []string
	containers []fakeContainer
}

func (f *fakeDocker) Compose(ctx context.Context, project string, args ...string) error {
	f.calls = append(f.calls, append([]string{project}, args...))
	return nil
}
func (f *fakeDocker) ComposePS(ctx context.Context, project string) ([]ServiceState, error) {
	if f.psErr != nil {
		return nil, f.psErr
	}
	if len(f.psQueue) == 0 {
		return nil, nil
	}
	out := f.psQueue[0]
	f.psQueue = f.psQueue[1:]
	return out, nil
}
func (f *fakeDocker) ListVolumes(ctx context.Context) ([]string, error) { return f.volumes, nil }
func (f *fakeDocker) ListContainers(ctx context.Context, filters ...string) ([]Container, error) {
	var out []Container
	for _, c := range f.containers {
		if fakeContainerMatches(c, filters) {
			out = append(out, Container{ID: c.id, Name: c.name})
		}
	}
	return out, nil
}

func fakeContainerMatches(c fakeContainer, filters []string) bool {
	for _, f := range filters {
		switch {
		case strings.HasPrefix(f, "label=com.docker.compose.project="):
			if c.project != strings.TrimPrefix(f, "label=com.docker.compose.project=") {
				return false
			}
		case f == "label=io.lando.container=TRUE":
			if !c.lando {
				return false
			}
		case strings.HasPrefix(f, "name="):
			if c.name != strings.TrimPrefix(f, "name=") {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func TestWaitForInitSucceedsWhenAllExitZero(t *testing.T) {
	d := &fakeDocker{psQueue: [][]ServiceState{
		{{Service: "wordpress", State: "running", ExitCode: 0}}, // not done yet
		{{Service: "wordpress", State: "exited", ExitCode: 0}},  // done
	}}
	if err := WaitForInit(context.Background(), d, "proj", []string{"wordpress"}, time.Millisecond); err != nil {
		t.Fatalf("WaitForInit: %v", err)
	}
}

func TestWaitForInitFailsOnNonZeroExit(t *testing.T) {
	d := &fakeDocker{psQueue: [][]ServiceState{
		{{Service: "wordpress", State: "exited", ExitCode: 3}},
	}}
	if err := WaitForInit(context.Background(), d, "proj", []string{"wordpress"}, time.Millisecond); err == nil {
		t.Fatal("expected error on non-zero init exit")
	}
}

func TestWaitForInitPropagatesPSError(t *testing.T) {
	d := &fakeDocker{psErr: errors.New("boom")}
	if err := WaitForInit(context.Background(), d, "proj", []string{"wordpress"}, time.Millisecond); err == nil {
		t.Fatal("expected ps error to propagate")
	}
}
