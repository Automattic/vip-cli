package siteimport

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/tui"
)

func TestStatusDebugSummarizesWithoutServerOutput(t *testing.T) {
	var logs bytes.Buffer
	ctx := debuglog.WithLogger(context.Background(), "vip:lib/site-import/status", &logs)
	_, err := CheckStatus(ctx, CheckStatusOpts{Tracker: tui.NewProgressTracker(nil), Interval: time.Millisecond, Fetch: scriptedFetch([]ProgressSnapshot{
		{Job: nil},
		{Job: &ImportJob{Status: "SERVER_SECRET", CreatedAt: "2026-01-01T00:00:00Z", CompletedAt: "TIME_SECRET", Steps: []JobStep{{ID: "ID_SECRET", Name: "NAME_SECRET", Status: tui.StepFailed}}}, StatusProgressStartedAt: 1767225602, FailedStep: &FailedStep{Name: "STEP_SECRET", Output: []string{"SQL_SECRET"}, StartedAt: 1767225603}},
	})})
	if err == nil {
		t.Fatal("expected failed import")
	}
	for _, want := range []string{"No import job", "status=unknown", "steps=1", "Import step failed"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("missing %q in %s", want, &logs)
		}
	}
	for _, secret := range []string{"SERVER_SECRET", "TIME_SECRET", "ID_SECRET", "NAME_SECRET", "STEP_SECRET", "SQL_SECRET"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("leaked %q", secret)
		}
	}
}
