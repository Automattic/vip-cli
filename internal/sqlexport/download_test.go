package sqlexport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestFormatBytes(t *testing.T) {
	for in, want := range map[int64]string{
		0:       "0 bytes",
		512:     "512 bytes",
		1024:    "1 KB",
		1536:    "1.5 KB",
		1048576: "1 MB",
	} {
		if got := FormatBytes(in); got != want {
			t.Errorf("FormatBytes(%d) = %q, want %q", in, got, want)
		}
	}
	if got := FormatMetricBytes(1000); got != "1 KB" {
		t.Errorf("FormatMetricBytes(1000) = %q", got)
	}
	if got := FormatMetricBytes(1500000000); got != "1.5 GB" {
		t.Errorf("FormatMetricBytes(1.5GB) = %q", got)
	}
}

func TestDownloadFileHappyPath(t *testing.T) {
	body := strings.Repeat("x", 200000)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// Explicit Content-Length so the progress callback sees a total
		// (large bodies otherwise go chunked in httptest).
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "out.sql.gz")
	var lastDownloaded, lastTotal int64
	err := DownloadFile(context.Background(), srv.URL, dest, func(d, total int64) {
		lastDownloaded, lastTotal = d, total
	})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(dest) // #nosec G304
	if len(got) != len(body) {
		t.Errorf("len = %d", len(got))
	}
	if lastDownloaded != int64(len(body)) || lastTotal != int64(len(body)) {
		t.Errorf("progress = %d/%d", lastDownloaded, lastTotal)
	}
}

func TestDownloadFileNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "gone", http.StatusNotFound)
	}))
	defer srv.Close()
	err := DownloadFile(context.Background(), srv.URL, filepath.Join(t.TempDir(), "x"), nil)
	// download-file.ts:24.
	if err == nil || !strings.Contains(err.Error(), "Failed to download file. Status: 404 Not Found") {
		t.Errorf("err = %v", err)
	}
}

func TestConfirmEnoughStorage(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	// plenty of space → no prompt
	cont, shown, err := ConfirmEnoughStorage(10,
		func() (int64, error) { return 1000, nil },
		func(string) (bool, error) { t.Fatal("must not prompt"); return false, nil })
	if err != nil || !cont || shown {
		t.Errorf("cont=%v shown=%v err=%v", cont, shown, err)
	}
	// tight space → prompt with the recommendation message
	var msg string
	cont, shown, err = ConfirmEnoughStorage(2_000_000_000,
		func() (int64, error) { return 10, nil },
		func(m string) (bool, error) { msg = m; return true, nil })
	if err != nil || !cont || !shown {
		t.Errorf("cont=%v shown=%v err=%v", cont, shown, err)
	}
	if !strings.Contains(msg, "We recommend that you have at least 2 GB of free space in your machine to download this database backup.") {
		t.Errorf("msg = %q", msg)
	}
}

func TestFreeBytesAt(t *testing.T) {
	free, err := FreeBytesAt(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if free <= 0 {
		t.Errorf("free = %d", free)
	}
}
