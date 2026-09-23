package searchreplace

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/debuglog"
)

func TestRunContextReportsRoutesWithoutSensitiveValues(t *testing.T) {
	for _, mode := range []string{"in-place", "temporary-file", "file"} {
		t.Run(mode, func(t *testing.T) {
			t.Setenv("VIP_SEARCH_REPLACE_BIN", fakeBinary(t))
			input := write(t, "private-input.sql", "-- metadata.header 1\n-- private_table 123\n")
			opts := Options{InPlace: mode == "in-place"}
			if mode == "file" {
				opts.Output = filepath.Join(t.TempDir(), "private-output.sql")
			}
			var diagnostics bytes.Buffer
			ctx := debuglog.WithLogger(context.Background(), "@automattic/vip:lib:search-and-replace", &diagnostics)
			result, err := RunContext(ctx, input, []string{"private-search,private-replacement"}, opts)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "temporary-file" {
				t.Cleanup(func() { _ = os.RemoveAll(filepath.Dir(result.OutputFileName)) })
			}
			got, err := os.ReadFile(result.OutputFileName)
			if err != nil || !strings.Contains(string(got), "-- PRIVATE_TABLE -1") {
				t.Fatalf("mydumper output=%q err=%v", got, err)
			}
			log := diagnostics.String()
			for _, want := range []string{"input=file", "output=" + mode, "stage=started", "mydumper=true", "stage=completed"} {
				if !strings.Contains(log, want) {
					t.Errorf("missing %q in %q", want, log)
				}
			}
			for _, secret := range []string{input, result.OutputFileName, "private-", "PRIVATE_TABLE", "metadata.header"} {
				if strings.Contains(log, secret) {
					t.Errorf("diagnostics expose %q: %q", secret, log)
				}
			}
		})
	}
}

func TestRunContextDoesNotReportCompletionWhenCompanionFails(t *testing.T) {
	t.Setenv("VIP_SEARCH_REPLACE_BIN", failingBinary(t))
	input := write(t, "private-input.sql", "private_sql\n")
	var diagnostics bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "*", &diagnostics)
	_, err := RunContext(ctx, input, []string{"private-search,private-replacement"}, Options{InPlace: true})
	if err == nil {
		t.Fatal("expected companion failure")
	}
	log := diagnostics.String()
	if !strings.Contains(log, "stage=started") || strings.Contains(log, "stage=completed") {
		t.Fatalf("inaccurate stage diagnostics: %q", log)
	}
	if strings.Contains(log, "private") {
		t.Fatalf("sensitive diagnostic: %q", log)
	}
	got, err := os.ReadFile(input)
	if err != nil || string(got) != "private_sql\n" {
		t.Fatalf("input changed: %q err=%v", got, err)
	}
}
