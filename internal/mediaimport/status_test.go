package mediaimport

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func scripted(snaps []*Status, errs []error) StatusFetch {
	i := 0
	return func(ctx context.Context) (*Status, error) {
		idx := i
		if i < len(snaps)-1 {
			i++
		}
		var err error
		if idx < len(errs) {
			err = errs[idx]
		}
		return snaps[idx], err
	}
}

func TestCheckStatusCompletes(t *testing.T) {
	tr := NewTracker()
	var polls []string
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scripted([]*Status{
			{Status: "RUNNING", FilesTotal: 10, FilesProcessed: 5, HasFilesProcessed: true},
			{Status: "COMPLETED", FilesTotal: 10, FilesProcessed: 10, HasFilesProcessed: true},
		}, nil),
		Tracker:  tr,
		Interval: time.Millisecond,
		OnPoll:   func(s string) { polls = append(polls, s) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "COMPLETED" {
		t.Errorf("res = %+v", res)
	}
	if len(polls) < 2 || polls[len(polls)-1] != "COMPLETED" {
		t.Errorf("polls = %v", polls)
	}
}

func TestCheckStatusAbortedResolves(t *testing.T) {
	tr := NewTracker()
	res, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch:    scripted([]*Status{{Status: "ABORTED"}}, nil),
		Tracker:  tr,
		Interval: time.Millisecond,
	})
	if err != nil || res.Status != "ABORTED" {
		t.Errorf("res=%+v err=%v", res, err)
	}
}

func TestCheckStatusFailedRejects(t *testing.T) {
	tr := NewTracker()
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch: scripted([]*Status{{
			Status: "FAILED",
			FailureDetails: &FailureDetails{
				PreviousStatus: "RUNNING",
				GlobalErrors:   []string{"boom"},
			},
		}}, nil),
		Tracker:  tr,
		Interval: time.Millisecond,
	})
	var fe *MediaImportError
	if !errors.As(err, &fe) || fe.Status != "FAILED" {
		t.Fatalf("err = %v (%T)", err, err)
	}
	msg := BuildErrorMessage(fe)
	if !strings.Contains(msg, "Import failed at status:") || !strings.Contains(msg, "RUNNING") ||
		!strings.Contains(msg, "boom") {
		t.Errorf("msg = %q", msg)
	}
	if !tr.HasFailure() {
		t.Error("tracker must record the failure")
	}
}

func TestCheckStatusNilStatusRejects(t *testing.T) {
	tr := NewTracker()
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch:    scripted([]*Status{nil}, nil),
		Tracker:  tr,
		Interval: time.Millisecond,
	})
	want := "Requested app/environment is not available for this operation. If you think this is not correct, please contact Support."
	var fe *MediaImportError
	if !errors.As(err, &fe) || fe.ErrorText != want {
		t.Errorf("err = %v", err)
	}
}

func TestCheckStatusFetchErrorRejects(t *testing.T) {
	tr := NewTracker()
	_, err := CheckStatus(context.Background(), CheckStatusOpts{
		Fetch:    scripted([]*Status{nil}, []error{errors.New("network exploded")}),
		Tracker:  tr,
		Interval: time.Millisecond,
	})
	var fe *MediaImportError
	if !errors.As(err, &fe) || fe.ErrorText != "network exploded" {
		t.Errorf("err = %v", err)
	}
}

func TestBuildErrorMessageGenericFallback(t *testing.T) {
	fe := &MediaImportError{ErrorText: "network exploded"}
	msg := BuildErrorMessage(fe)
	for _, want := range []string{
		"network exploded",
		"Please check the status of your Import using `vip import media status @mysite.production`",
		"If this error persists and you are not sure on how to fix, please contact support",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("msg missing %q:\n%s", want, msg)
		}
	}
}

func TestBuildFileErrors(t *testing.T) {
	fileErrors := []FileError{
		{FileName: "a.jpg", Errors: []string{"too big", "bad name"}},
		{FileName: "", Errors: nil},
	}
	txt := BuildFileErrors(fileErrors, false)
	if !strings.Contains(txt, "File Name: a.jpg") || !strings.Contains(txt, "too big, bad name") ||
		!strings.Contains(txt, "File Name: N/A") || !strings.Contains(txt, "unknown error") {
		t.Errorf("txt = %q", txt)
	}
	jsonOut := BuildFileErrors(fileErrors, true)
	// format.ts:35 — JSON.stringify(data, null, '\t')
	if !strings.Contains(jsonOut, "\t\"fileName\": \"a.jpg\"") {
		t.Errorf("json = %q", jsonOut)
	}
}

func TestPollIntervalRamp(t *testing.T) {
	// status.ts:258-266: base 1s; after two minutes, +1s every minute.
	now := time.Now()
	r := newIntervalRamp(time.Second, now)
	if got := r.next(now.Add(30 * time.Second)); got != time.Second {
		t.Errorf("t+30s = %v, want 1s", got)
	}
	if got := r.next(now.Add(2*time.Minute + time.Second)); got != 2*time.Second {
		t.Errorf("after 2m = %v, want 2s", got)
	}
	if got := r.next(now.Add(3*time.Minute + 2*time.Second)); got != 3*time.Second {
		t.Errorf("after 3m = %v, want 3s", got)
	}
}
