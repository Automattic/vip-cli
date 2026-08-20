package appctx

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/Automattic/vip/internal/output"
)

// TestWithFormatRegistersFlagBeforeParse pins the bug where ensureFormatFlag
// was called lazily inside the RunE closure. With the fix, WithFormat must
// register --format at apply time so cobra can parse it before RunE runs.
func TestWithFormatRegistersFlagBeforeParse(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	WithFormat(cmd, "table", "table", "json")
	if cmd.Flag("format") == nil {
		t.Fatal("WithFormat must register --format at apply time, not lazily inside RunE")
	}
}

func TestWithFormatDefaultsRendersTable(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	cmd.SetContext(context.Background())

	mw := WithFormat(cmd, "table", "table", "csv", "json")
	run := mw(func(cmd *cobra.Command, args []string) (any, error) {
		return output.OrderedRows{{{Key: "id", Value: 1}}}, nil
	})
	if _, err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !strings.Contains(buf.String(), "1") {
		t.Errorf("table output missing data: %s", buf.String())
	}
}

func TestWithFormatRejectsUnknownFormat(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	cmd.SetContext(context.Background())
	cmd.Flags().String("format", "yaml", "")
	mw := WithFormat(cmd, "table", "table", "csv")
	run := mw(func(cmd *cobra.Command, args []string) (any, error) {
		t.Error("handler must not run on rejected format")
		return nil, nil
	})
	_, err := run(cmd, nil)
	wantSubstr := "Invalid format: yaml. The supported formats are: table, csv."
	if err == nil || !strings.Contains(err.Error(), wantSubstr) {
		t.Errorf("err = %v, want contains %q", err, wantSubstr)
	}
}

func TestWithFormatExposesViaFormatFromContext(t *testing.T) {
	cmd := &cobra.Command{Use: "x"}
	cmd.SetContext(context.Background())
	cmd.Flags().String("format", "json", "")
	mw := WithFormat(cmd, "table", "table", "json")
	var seen output.Format
	run := mw(func(cmd *cobra.Command, args []string) (any, error) {
		seen = FormatFromContext(cmd.Context())
		return nil, nil
	})
	if _, err := run(cmd, nil); err != nil {
		t.Fatalf("run: %v", err)
	}
	if seen != output.FormatJSON {
		t.Errorf("FormatFromContext = %q, want json", seen)
	}
}
