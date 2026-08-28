package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/telemetry"
)

type capturingClient struct {
	events []capturedEvent
}

type capturedEvent struct {
	name  string
	props map[string]any
}

func (c *capturingClient) TrackEvent(name string, props map[string]any) error {
	c.events = append(c.events, capturedEvent{name: name, props: props})
	return nil
}

// TestCLIErrorHookScrubsThePayload is the end-to-end assertion for the one
// telemetry event vip-next sends that Node has no counterpart for.
//
// exit.RegisterErrorHook fires on every non-zero exit, and the hook posts the
// error text to public-api.wordpress.com. Before this change it sent
// err.Error() verbatim, so an ordinary "open <path>: permission denied" carried
// the user's home directory — account name and all — plus, on a failed
// presigned download, a live credential.
func TestCLIErrorHookScrubsThePayload(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")

	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("no home directory available: %v", err)
	}
	secretPath := filepath.Join(home, "clients", "acme-corp", "db.sql")

	client := &capturingClient{}
	tracker := &telemetry.Tracker{Clients: []telemetry.Client{client}}

	hook := cliErrorHook(tracker)
	hook(errors.New("open " + secretPath + ": permission denied"))

	if len(client.events) != 1 {
		t.Fatalf("got %d events, want 1", len(client.events))
	}
	ev := client.events[0]
	if ev.name != "cli_error" {
		t.Errorf("event name = %q, want cli_error", ev.name)
	}
	text, _ := ev.props["error"].(string)
	if strings.Contains(text, home) {
		t.Errorf("cli_error payload carries the home directory off-box:\n\t%s", text)
	}
	if !strings.Contains(text, "permission denied") {
		t.Errorf("cli_error payload lost the diagnostic part:\n\t%s", text)
	}
}

// TestCLIErrorHookScrubsPresignedCredentials pins the credential case
// specifically: a failed media-import report download returns a *url.Error
// carrying the signature query string.
func TestCLIErrorHookScrubsPresignedCredentials(t *testing.T) {
	t.Setenv("DO_NOT_TRACK", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("NODE_ENV", "")

	client := &capturingClient{}
	tracker := &telemetry.Tracker{Clients: []telemetry.Client{client}}

	cliErrorHook(tracker)(errors.New(
		`Get "https://vip.s3.amazonaws.com/report.json?X-Amz-Signature=abc123def456": i/o timeout`))

	if len(client.events) != 1 {
		t.Fatalf("got %d events, want 1", len(client.events))
	}
	text, _ := client.events[0].props["error"].(string)
	for _, secret := range []string{"X-Amz-Signature", "abc123def456"} {
		if strings.Contains(text, secret) {
			t.Errorf("cli_error payload carries %q off-box:\n\t%s", secret, text)
		}
	}
}
