package devlog

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestWriterFlushesPartialLineOnClose(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	l, err := Open("testslug")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	w := l.Writer()
	w.Write([]byte("no newline at end"))
	if err := w.Close(); err != nil {
		t.Fatalf("Writer Close: %v", err)
	}
	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	b, err := os.ReadFile(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "no newline at end") {
		t.Fatalf("partial line lost; log:\n%s", b)
	}
}

func TestWriterPrefixesCompleteLinesIntoLogFile(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	l, err := Open("testslug")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	w := l.Writer()
	// Two writes that together form exactly two complete lines split across
	// the write boundary ("hello\n" and "world\n"). No partial remains.
	w.Write([]byte("hello\nwor"))
	w.Write([]byte("ld\n"))
	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	b, err := os.ReadFile(l.Path())
	if err != nil {
		t.Fatal(err)
	}
	got := string(b)
	if c := strings.Count(got, "[vip-dev-env] INFO:"); c != 2 {
		t.Fatalf("expected 2 prefixed lines, got %d in:\n%s", c, got)
	}
	if !strings.Contains(got, "hello") || !strings.Contains(got, "world") {
		t.Fatalf("log missing content:\n%s", got)
	}
}

func TestWriteBannerOnlyOnEmptyLog(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	b := Banner{
		Command: "vip dev-env start",
		OS:      "darwin 25.5.0 arm64",
		CLI:     "4.0.0",
		Runtime: "go",
		Docker:  DockerVersions{Engine: "27.0", Compose: "2.29", ComposePlugin: "2.29", DockerBin: "/usr/bin/docker", ComposeBin: "docker compose"},
		RAMGB:   "16.0 GB",
		CPUs:    "10",
	}

	l, _ := Open("testslug")
	if err := l.WriteBanner(b); err != nil {
		t.Fatalf("WriteBanner: %v", err)
	}
	// Second call must be a no-op because the file is no longer empty.
	if err := l.WriteBanner(b); err != nil {
		t.Fatalf("WriteBanner (2nd): %v", err)
	}
	l.Close()

	data, _ := os.ReadFile(l.Path())
	got := string(data)
	if c := strings.Count(got, "=== VIP Dev Env Log ==="); c != 1 {
		t.Fatalf("banner written %d times, want 1:\n%s", c, got)
	}
	for _, want := range []string{"COMMAND", "DOCKER ENGINE", "27.0", "vip dev-env start"} {
		if !strings.Contains(got, want) {
			t.Fatalf("banner missing %q:\n%s", want, got)
		}
	}
}

func TestFinishPrintsLogPathFooter(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	l, _ := Open("testslug")

	var tty bytes.Buffer
	l.SetFooterWriter(&tty)
	l.Finish()
	l.Close()

	if !strings.Contains(tty.String(), "COMMAND LOG FILE") {
		t.Fatalf("footer missing label: %q", tty.String())
	}
	if !strings.Contains(tty.String(), l.Path()) {
		t.Fatalf("footer missing path %q in %q", l.Path(), tty.String())
	}
}
