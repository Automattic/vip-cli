//go:build parity && !windows

package parity

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os/exec"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/creack/pty"
)

func runEdgePrompt(t *testing.T, bin, dir string, args, env []string, prompt, answer string, redirect bool) (string, int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	cmd.Env = env
	// The PTY owns its session; on timeout also stop the Node dispatch child.
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	var stdout bytes.Buffer
	if redirect {
		cmd.Stdout = &stdout
	}
	master, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 160})
	if err != nil {
		t.Fatal(err)
	}
	defer master.Close()
	chunks := make(chan string, 128)
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		buffer := make([]byte, 4096)
		for {
			n, err := master.Read(buffer)
			if n > 0 {
				chunks <- string(buffer[:n])
			}
			if err != nil {
				return
			}
		}
	}()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	var transcript strings.Builder
	answered := false
	queries := 0
	var answerTimer <-chan time.Time
	for {
		select {
		case chunk := <-chunks:
			transcript.WriteString(chunk)
			// Survey asks the terminal for its cursor position before reading
			// input. A PTY is only a byte stream, so emulate the terminal reply.
			for count := strings.Count(transcript.String(), "[6n"); queries < count; queries++ {
				_, _ = io.WriteString(master, "\x1b[24;80R")
			}
			if prompt != "" && !answered && answerTimer == nil && strings.Contains(transcript.String(), prompt) {
				answerTimer = time.After(100 * time.Millisecond)
			}
		case <-answerTimer:
			answered = true
			answerTimer = nil
			if _, err := io.WriteString(master, answer+"\r"); err != nil {
				t.Fatal(err)
			}
		case err := <-done:
			master.Close()
			<-readDone
			for len(chunks) > 0 {
				transcript.WriteString(<-chunks)
			}
			if ctx.Err() != nil {
				t.Fatalf("prompt timed out; answered=%v transcript=%s", answered, transcript.String())
			}
			if prompt != "" && !answered {
				t.Fatalf("missing prompt %q: %s", prompt, transcript.String())
			}
			code := 0
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				code = exitErr.ExitCode()
			} else if err != nil {
				t.Fatal(err)
			}
			return stdout.String() + transcript.String(), code
		}
	}
}

func TestEdgeWorkersPromptParity(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("Edge Workers terminal prompts", skip))
	}
	for _, tc := range []struct {
		name, action, answer, state, fixture, prompt string
		redirect                                     bool
		want                                         int
		ops                                          []string
	}{
		{"deploy-approve", "deploy", "y", "empty", "two-workers", "Deploy 2 edge workers (a, b) to example-app.production?", false, 0, []string{"create:a", "create:b"}},
		{"deploy-decline", "deploy", "n", "empty", "two-workers", "Deploy 2 edge workers (a, b) to example-app.production?", false, 1, []string{}},
		{"enable-decline", "enable", "n", "inactive", "basic", `Enable edge worker "headers" on example-app.production?`, false, 1, []string{}},
		{"delete-approve", "delete", "y", "inactive", "basic", `Permanently delete edge worker "headers" from example-app.production?`, false, 0, []string{"delete:headers"}},
		{"delete-decline", "delete", "n", "inactive", "basic", `Permanently delete edge worker "headers" from example-app.production?`, false, 1, []string{}},
		{"stdout-redirect", "deploy", "", "empty", "basic", "", true, 1, []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, bin := range []string{rig.nodeBin, rig.goBin} {
				dir := edgeFixtureProject(t, tc.fixture)
				api := newEdgeFixtureAPI(tc.state)
				rig.serve(t, api)
				args := []string{"edge-workers", tc.action, "headers", "--app=42", "--env=production"}
				if tc.action == "deploy" {
					args = append(args, "--skip-build")
					if tc.fixture == "two-workers" {
						args[2] = "--all"
					}
				}
				env := FixtureEnv(rig.scenarioEnv(&Scenario{Env: map[string]string{"NO_COLOR": "1", "TERM": "xterm", "VIP_NON_INTERACTIVE": "0"}}))
				transcript, code := runEdgePrompt(t, bin, dir, args, env, tc.prompt, tc.answer, tc.redirect)
				if code != tc.want {
					t.Errorf("exit %d want %d: %s", code, tc.want, transcript)
				}
				ops, _ := api.snapshot()
				if !reflect.DeepEqual(ops, tc.ops) {
					t.Errorf("operations %v want %v", ops, tc.ops)
				}
				if tc.redirect && !strings.Contains(transcript, "Refusing to deploy") {
					t.Errorf("missing redirected-output refusal: %s", transcript)
				}
			}
		})
	}
}
