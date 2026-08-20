package lifecycle

import (
	"context"
	"strings"
	"testing"
)

func downArgs(t *testing.T, d *recDocker) string {
	t.Helper()
	for _, a := range d.composeArgs {
		if len(a) > 0 && a[0] == "down" {
			return strings.Join(a, " ")
		}
	}
	t.Fatalf("no compose down call recorded: %v", d.composeArgs)
	return ""
}

func TestStopIssuesComposeStop(t *testing.T) {
	ev := []string{}
	d := &recDocker{events: &ev}
	if err := Stop(context.Background(), d, "proj"); err != nil {
		t.Fatal(err)
	}
	if len(ev) != 1 || ev[0] != "compose:stop" {
		t.Fatalf("want [compose:stop], got %v", ev)
	}
}

func TestDestroyDownsAndCleansProxyWhenLast(t *testing.T) {
	var ev []string
	d := &recDocker{events: &ev}
	pr := recProxy{events: &ev}
	if err := Destroy(context.Background(), d, pr, "proj", 0); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(ev, ",")
	if !strings.Contains(joined, "compose:down") {
		t.Fatalf("destroy must compose down: %v", ev)
	}
	if !strings.Contains(joined, "proxy.Cleanup") {
		t.Fatalf("destroy with remaining=0 must clean the proxy: %v", ev)
	}
	if da := downArgs(t, d); !strings.Contains(da, "--volumes") {
		t.Fatalf("destroy down must pass --volumes (remove env-owned volumes): %q", da)
	}
}

func TestDestroyKeepsProxyWhenOtherEnvsRemain(t *testing.T) {
	var ev []string
	d := &recDocker{events: &ev}
	pr := recProxy{events: &ev}
	if err := Destroy(context.Background(), d, pr, "proj", 2); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(ev, ",")
	if !strings.Contains(joined, "compose:down") {
		t.Fatalf("destroy must compose down: %v", ev)
	}
	if strings.Contains(joined, "proxy.Cleanup") {
		t.Fatalf("destroy with remaining>0 must NOT clean the proxy: %v", ev)
	}
}

func TestRebuildDownsAndGuardsOrphan(t *testing.T) {
	var ev []string
	d := &recDocker{events: &ev}
	pr := recProxy{events: &ev}
	if err := Rebuild(context.Background(), d, pr, "proj"); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(ev, ",")
	if !strings.Contains(joined, "compose:down") {
		t.Fatalf("rebuild must compose down: %v", ev)
	}
	if !strings.Contains(joined, "proxy.RemoveOrphan") {
		t.Fatalf("rebuild must guard against orphan proxy: %v", ev)
	}
	if da := downArgs(t, d); strings.Contains(da, "--volumes") {
		t.Fatalf("rebuild down must NOT pass --volumes (keep data): %q", da)
	}
}
