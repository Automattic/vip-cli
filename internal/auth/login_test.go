package auth

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeTracker struct {
	events []string
	props  []map[string]any
}

func (f *fakeTracker) Track(name string, props map[string]any) {
	f.events = append(f.events, name)
	f.props = append(f.props, props)
}

func TestLoginPrintsBannerAndTokenURL(t *testing.T) {
	var stdout bytes.Buffer
	tr := &fakeTracker{}
	lf := &LoginFlow{
		Stdout:  &stdout,
		Tracker: tr,
		Confirm: func(string) (bool, error) { return false, nil },
		OpenURL: func(string) error {
			t.Fatal("OpenURL must not be called")
			return nil
		},
		ReadToken: func() (string, error) {
			t.Fatal("ReadToken must not be called")
			return "", nil
		},
	}
	_, err := lf.Run()
	if !errors.Is(err, ErrLoginCancelled) {
		t.Errorf("expected ErrLoginCancelled, got %v", err)
	}
	out := stdout.String()
	wantBanner := "\n" +
		"\x1b[38;2;232;196;142m  ██╗   ██╗██╗██████╗        ██████╗██╗     ██╗    ███████╗\x1b[0m\n" +
		"\x1b[38;2;224;181;118m  ██║   ██║██║██╔══██╗      ██╔════╝██║     ██║    ██╔════╝\x1b[0m\n" +
		"\x1b[38;2;216;164;95m  ██║   ██║██║██████╔╝█████╗██║     ██║     ██║    ███████╗\x1b[0m\n" +
		"\x1b[38;2;205;150;78m  ╚██╗ ██╔╝██║██╔═══╝ ╚════╝██║     ██║     ██║    ╚════██║\x1b[0m\n" +
		"\x1b[38;2;195;137;60m   ╚████╔╝ ██║██║           ╚██████╗███████╗██║    ███████║\x1b[0m\n" +
		"\x1b[38;2;185;124;45m    ╚═══╝  ╚═╝╚═╝            ╚═════╝╚══════╝╚═╝    ╚══════╝\x1b[0m\n\n"
	if !strings.HasPrefix(out, wantBanner) {
		t.Errorf("new VIP-CLI 5 banner missing:\n%s", out)
	}
	if !strings.Contains(out, "VIP-CLI is your tool for interacting with and managing your VIP applications.") {
		t.Errorf("banner subtitle missing: %q", out)
	}
	if !strings.Contains(out, "https://dashboard.wpvip.com/me/cli/token") {
		t.Errorf("token URL missing: %q", out)
	}
	if len(tr.events) != 2 || tr.events[0] != "login_command_execute" || tr.events[1] != "login_command_browser_cancelled" {
		t.Errorf("events = %v", tr.events)
	}
}

func TestLoginAcceptsValidToken(t *testing.T) {
	iat := time.Now().Add(-time.Hour).Unix()
	exp := time.Now().Add(time.Hour).Unix()
	raw, _ := encodeUnsignedJWT(map[string]any{"id": 7, "iat": iat, "exp": exp})
	var stdout bytes.Buffer
	tr := &fakeTracker{}
	openCalled := false
	saved := ""
	aliased := int64(0)
	lf := &LoginFlow{
		Stdout:    &stdout,
		Tracker:   tr,
		Confirm:   func(string) (bool, error) { return true, nil },
		OpenURL:   func(u string) error { openCalled = true; return nil },
		ReadToken: func() (string, error) { return raw, nil },
		SaveToken: func(s string) error { saved = s; return nil },
		Alias:     func(id int64) { aliased = id },
	}
	tok, err := lf.Run()
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !openCalled {
		t.Error("OpenURL must be called")
	}
	if tok.ID != 7 {
		t.Errorf("tok.ID = %d, want 7", tok.ID)
	}
	if saved != raw {
		t.Errorf("SaveToken not invoked correctly")
	}
	if aliased != 7 {
		t.Errorf("Alias = %d, want 7", aliased)
	}
	wantEvents := []string{"login_command_execute", "login_command_browser_opened", "login_command_token_submit_success"}
	if !equalStringSlices(tr.events, wantEvents) {
		t.Errorf("events = %v, want %v", tr.events, wantEvents)
	}
}

func TestLoginPersistenceFailurePreventsAlias(t *testing.T) {
	iat := time.Now().Add(-time.Hour).Unix()
	exp := time.Now().Add(time.Hour).Unix()
	raw, _ := encodeUnsignedJWT(map[string]any{"id": 7, "iat": iat, "exp": exp})
	var stdout bytes.Buffer
	tr := &fakeTracker{}
	aliasCalled := false
	lf := &LoginFlow{
		Stdout:    &stdout,
		Tracker:   tr,
		Confirm:   func(string) (bool, error) { return true, nil },
		OpenURL:   func(string) error { return nil },
		ReadToken: func() (string, error) { return raw, nil },
		SaveToken: func(string) error { return errors.New("save failed") },
		Alias:     func(int64) { aliasCalled = true },
	}
	if _, err := lf.Run(); err == nil || err.Error() != "save failed" {
		t.Fatalf("Run error = %v, want save failed", err)
	}
	if aliasCalled {
		t.Fatal("Alias must not run after persistence failure")
	}
	if tr.events[len(tr.events)-1] != "login_command_token_submit_error" {
		t.Fatalf("last event = %v", tr.events)
	}
}

func TestLoginRejectsMalformedToken(t *testing.T) {
	var stdout bytes.Buffer
	tr := &fakeTracker{}
	lf := &LoginFlow{
		Stdout:    &stdout,
		Tracker:   tr,
		Confirm:   func(string) (bool, error) { return true, nil },
		OpenURL:   func(string) error { return nil },
		ReadToken: func() (string, error) { return "garbage", nil },
	}
	_, err := lf.Run()
	if !errors.Is(err, ErrTokenMalformed) {
		t.Fatalf("expected ErrTokenMalformed, got %v", err)
	}
	if !strings.Contains(stdout.String(), "The token provided is malformed. Please check the token and try again.") {
		t.Errorf("malformed message missing: %q", stdout.String())
	}
	if len(tr.events) < 1 || tr.events[len(tr.events)-1] != "login_command_token_submit_error" {
		t.Errorf("last event = %v", tr.events)
	}
}

func TestLoginRejectsExpiredToken(t *testing.T) {
	iat := time.Now().Add(-2 * time.Hour).Unix()
	exp := time.Now().Add(-time.Hour).Unix()
	raw, _ := encodeUnsignedJWT(map[string]any{"id": 7, "iat": iat, "exp": exp})
	var stdout bytes.Buffer
	tr := &fakeTracker{}
	lf := &LoginFlow{
		Stdout:    &stdout,
		Tracker:   tr,
		Confirm:   func(string) (bool, error) { return true, nil },
		OpenURL:   func(string) error { return nil },
		ReadToken: func() (string, error) { return raw, nil },
	}
	_, err := lf.Run()
	if !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("expected ErrTokenExpired, got %v", err)
	}
	if !strings.Contains(stdout.String(), "The token provided is expired. Please log in again to refresh the token.") {
		t.Errorf("expired message missing: %q", stdout.String())
	}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
