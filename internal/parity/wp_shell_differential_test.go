//go:build parity && !windows

package parity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/creack/pty"
	"golang.org/x/term"
)

type shellOutput struct {
	mu      sync.Mutex
	text    strings.Builder
	changed chan struct{}
}

func newShellOutput() *shellOutput {
	return &shellOutput{changed: make(chan struct{}, 1)}
}

func (o *shellOutput) Write(p []byte) (int, error) {
	o.mu.Lock()
	n, err := o.text.Write(p)
	o.mu.Unlock()
	select {
	case o.changed <- struct{}{}:
	default:
	}
	return n, err
}

func (o *shellOutput) String() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.text.String()
}

func waitForShellOutput(t *testing.T, output *shellOutput, done <-chan error, after int, needle string) int {
	t.Helper()
	deadline := time.NewTimer(12 * time.Second)
	defer deadline.Stop()
	for {
		got := output.String()
		if after <= len(got) {
			if i := strings.Index(got[after:], needle); i >= 0 {
				return after + i + len(needle)
			}
		}
		select {
		case <-output.changed:
		case err := <-done:
			t.Fatalf("shell exited before %q: %v\nstdout: %q", needle, err, output.String())
		case <-deadline.C:
			t.Fatalf("timeout waiting for %q\nstdout: %q", needle, output.String())
		}
	}
}

type shellMock struct {
	mu             sync.Mutex
	commands       []string
	appBody        []byte
	poll           chan string
	stdoutStreamID string
	streamExitCode int
	stdinStreamID  string
	needsInput     bool
	inputReady     chan struct{}
	inputReadyOnce sync.Once
	remoteBytes    chan byte
}

func (m *shellMock) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/socket.io/") {
		m.serveSocket(w, r)
		return
	}
	body, _ := io.ReadAll(r.Body)
	s := string(body)
	w.Header().Set("Content-Type", "application/json")
	switch {
	case strings.Contains(s, `"operationName":"ResolveAppByName"`),
		strings.Contains(s, `"operationName":"ResolveAppByID"`),
		strings.Contains(s, `"operationName":"App"`):
		_, _ = w.Write(m.appBody)
	case strings.Contains(s, `"operationName":"WPEnvInfo"`):
		_, _ = w.Write(wpEnvInfoJSON(2, "websocket", "develop"))
	case strings.Contains(s, `"operationName":"TriggerWPCLICommand"`),
		strings.Contains(s, `"operationName":"TriggerWPCLICommandMutation"`):
		var request struct {
			Variables struct {
				Input struct {
					Command string `json:"command"`
				} `json:"input"`
			} `json:"variables"`
		}
		if err := json.Unmarshal(body, &request); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		m.mu.Lock()
		m.commands = append(m.commands, request.Variables.Input.Command)
		m.stdoutStreamID = ""
		m.streamExitCode = 0
		m.stdinStreamID = ""
		m.needsInput = false
		m.mu.Unlock()
		if request.Variables.Input.Command == "option get home" {
			_, _ = w.Write([]byte(`{"errors":[{"message":"Test WP-CLI error"}],"data":null}`))
		} else {
			guid := "ws-guid-001"
			if request.Variables.Input.Command == "option get missing" ||
				request.Variables.Input.Command == `"option" "get" "missing"` {
				guid = "ws-fail-guid"
			} else if request.Variables.Input.Command == "eval read" {
				guid = "ws-stdin-guid"
			}
			_, _ = fmt.Fprintf(w, `{"data":{"triggerWPCLICommandOnAppEnvironment":{"inputToken":"tok-ws","command":{"guid":%q},"sshAuthentication":null}}}`, guid)
		}
	default:
		http.Error(w, "unexpected GraphQL operation", http.StatusBadRequest)
	}
}

func (m *shellMock) commandsSeen() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.commands...)
}

func (m *shellMock) serveSocket(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("transport") == "polling" {
		w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
		if r.URL.Query().Get("sid") == "" {
			_, _ = io.WriteString(w, `0{"sid":"shell","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)
			return
		}
		if r.Method == http.MethodPost {
			body, _ := io.ReadAll(r.Body)
			for _, packet := range strings.Split(string(body), "\x1e") {
				m.recordStreamID(packet)
			}
			if strings.Contains(string(body), "40/wp-cli,") {
				select {
				case m.poll <- `40/wp-cli,{"sid":"shell-nsp"}`:
				default:
				}
			}
			_, _ = io.WriteString(w, "ok")
			return
		}
		select {
		case packet := <-m.poll:
			_, _ = io.WriteString(w, packet)
		case <-time.After(3 * time.Second):
			_, _ = io.WriteString(w, "6")
		case <-r.Context().Done():
		}
		return
	}

	ws, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close(websocket.StatusNormalClosure, "")
	ctx := r.Context()
	_, probe, err := ws.Read(ctx)
	if err != nil || string(probe) != "2probe" {
		return
	}
	if err := ws.Write(ctx, websocket.MessageText, []byte("3probe")); err != nil {
		return
	}
	_, upgrade, err := ws.Read(ctx)
	if err != nil || string(upgrade) != "5" {
		return
	}
	m.mu.Lock()
	streamID := m.stdoutStreamID
	exitCode := m.streamExitCode
	stdinID := m.stdinStreamID
	needsInput := m.needsInput
	m.mu.Unlock()
	if streamID != "" {
		if err := m.startShellStream(ctx, ws, streamID, stdinID, needsInput, exitCode); err != nil {
			return
		}
	}
	var pendingAck int
	for {
		messageType, raw, err := ws.Read(ctx)
		if err != nil {
			return
		}
		if messageType == websocket.MessageBinary && pendingAck > 0 {
			for _, b := range raw {
				if m.remoteBytes != nil {
					m.remoteBytes <- b
				}
			}
			ack := fmt.Sprintf(`43/wp-cli,%d[]`, pendingAck)
			pendingAck = 0
			if err := ws.Write(ctx, websocket.MessageText, []byte(ack)); err != nil {
				return
			}
			if strings.ContainsRune(string(raw), 3) {
				m.mu.Lock()
				streamID := m.stdoutStreamID
				m.mu.Unlock()
				_ = finishShellStream(ctx, ws, streamID, 0)
			}
			continue
		}
		packet := string(raw)
		switch {
		case packet == "40/wp-cli,":
			_ = ws.Write(ctx, websocket.MessageText, []byte(`40/wp-cli,{"sid":"shell-nsp"}`))
		case strings.HasPrefix(packet, `42/wp-cli,["$stream","cmd",`):
			streamID := m.recordStreamID(packet)
			m.mu.Lock()
			exitCode := m.streamExitCode
			stdinID := m.stdinStreamID
			needsInput := m.needsInput
			m.mu.Unlock()
			if streamID == "" || m.startShellStream(ctx, ws, streamID, stdinID, needsInput, exitCode) != nil {
				return
			}
		case strings.HasPrefix(packet, "451-/wp-cli,"):
			rest := strings.TrimPrefix(packet, "451-/wp-cli,")
			bracket := strings.IndexByte(rest, '[')
			if bracket < 0 {
				return
			}
			pendingAck, err = strconv.Atoi(rest[:bracket])
			if err != nil {
				return
			}
		}
	}
}

func (m *shellMock) recordStreamID(packet string) string {
	if !strings.HasPrefix(packet, `42/wp-cli,["$stream","cmd",`) {
		return ""
	}
	var args []json.RawMessage
	if err := json.Unmarshal([]byte(strings.TrimPrefix(packet, "42/wp-cli,")), &args); err != nil || len(args) < 5 {
		return ""
	}
	var stream struct {
		ID string `json:"$stream"`
	}
	if err := json.Unmarshal(args[4], &stream); err != nil || stream.ID == "" {
		return ""
	}
	var stdinStream struct {
		ID string `json:"$stream"`
	}
	if err := json.Unmarshal(args[3], &stdinStream); err != nil {
		return ""
	}
	var data struct {
		GUID string `json:"guid"`
	}
	if err := json.Unmarshal(args[2], &data); err != nil {
		return ""
	}
	m.mu.Lock()
	m.stdoutStreamID = stream.ID
	m.stdinStreamID = stdinStream.ID
	m.streamExitCode = 0
	m.needsInput = data.GUID == "ws-stdin-guid"
	if data.GUID == "ws-fail-guid" {
		m.streamExitCode = 3
	}
	m.mu.Unlock()
	return stream.ID
}

func (m *shellMock) startShellStream(ctx context.Context, ws *websocket.Conn, stdoutID, stdinID string, needsInput bool, exitCode int) error {
	if !needsInput {
		return finishShellStream(ctx, ws, stdoutID, exitCode)
	}
	if stdinID == "" {
		return errors.New("stdin stream ID missing")
	}
	read := fmt.Sprintf(`42/wp-cli,["$stream-read",%q,65536]`, stdinID)
	if err := ws.Write(ctx, websocket.MessageText, []byte(read)); err != nil {
		return err
	}
	m.inputReadyOnce.Do(func() {
		if m.inputReady != nil {
			close(m.inputReady)
		}
	})
	return nil
}

func finishShellStream(ctx context.Context, ws *websocket.Conn, id string, exitCode int) error {
	// Give the command handler time to bind its stream-end listener after emit.
	time.Sleep(100 * time.Millisecond)
	end := fmt.Sprintf(`42/wp-cli,["$stream-end",%q]`, id)
	if err := ws.Write(ctx, websocket.MessageText, []byte(end)); err != nil {
		return err
	}
	if exitCode != 0 {
		// The real service can send its exit status after stdout EOF.
		time.Sleep(100 * time.Millisecond)
		exit := fmt.Sprintf(`42/wp-cli,["exit",{"exitCode":%d}]`, exitCode)
		return ws.Write(ctx, websocket.MessageText, []byte(exit))
	}
	return nil
}

func runShellSide(t *testing.T, rig *differentialRig, scenario *Scenario, bin string) *RunResult {
	t.Helper()
	appBody, err := os.ReadFile("../../testdata/parity/recordings/wp-websocket-shell/resolve-app.json")
	if err != nil {
		t.Fatal(err)
	}
	mock := &shellMock{appBody: appBody, poll: make(chan string, 2)}
	rig.serve(t, mock)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, scenario.Argv...)
	cmd.Env = FixtureEnv(scenario.Env)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, stderr := newShellOutput(), newShellOutput()
	cmd.Stdout, cmd.Stderr = stdout, stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	t.Cleanup(func() {
		_ = stdin.Close()
		cancel()
		select {
		case <-done:
		default:
		}
	})

	prompt := "parityapp.develop:~$ "
	pos := waitForShellOutput(t, stdout, done, 0, prompt)
	if got := mock.commandsSeen(); len(got) != 0 {
		t.Errorf("trigger before shell input: %q", got)
	}
	if _, err := io.WriteString(stdin, "invalid\n"); err != nil {
		t.Fatal(err)
	}
	pos = waitForShellOutput(t, stdout, done, pos, "invalid command, please pass a valid WP-CLI command.")
	pos = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 0 {
		t.Errorf("trigger after invalid command: %q", got)
	}
	if _, err := io.WriteString(stdin, "wp option get home\n"); err != nil {
		t.Fatal(err)
	}
	pos = waitForShellOutput(t, stdout, done, pos, "Test WP-CLI error")
	pos = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 1 || got[0] != "option get home" {
		t.Errorf("trigger commands = %q, want [option get home]", got)
	}
	if _, err := io.WriteString(stdin, "wp site list\n"); err != nil {
		t.Fatal(err)
	}
	pos = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 2 || got[1] != "site list" {
		t.Errorf("trigger commands after first successful socket command = %q", got)
	}
	if _, err := io.WriteString(stdin, "wp option get missing\n"); err != nil {
		t.Fatal(err)
	}
	pos = waitForShellOutput(t, stdout, done, pos, "Error: WP-CLI command failed with exit code 3")
	pos = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 3 || got[2] != "option get missing" {
		t.Errorf("trigger commands after failed socket command = %q", got)
	}
	if _, err := io.WriteString(stdin, "wp post list\n"); err != nil {
		t.Fatal(err)
	}
	pos = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 4 || got[3] != "post list" {
		t.Errorf("trigger commands after second successful socket command = %q", got)
	}
	if _, err := io.WriteString(stdin, "exit\n"); err != nil {
		t.Fatal(err)
	}
	_ = stdin.Close()
	select {
	case err := <-done:
		res := &RunResult{Stdout: stdout.String(), Stderr: stderr.String()}
		if err != nil {
			var exitErr *exec.ExitError
			if !errors.As(err, &exitErr) {
				t.Fatalf("shell wait: %v", err)
			}
			res.ExitCode = exitErr.ExitCode()
		}
		return res
	case <-ctx.Done():
		t.Fatalf("shell did not exit after exit command: %v\nstdout: %q\nstderr: %q", ctx.Err(), stdout.String(), stderr.String())
	}
	return nil
}

func TestWPWebsocketShellDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketShellDifferential", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	node := runShellSide(t, rig, scenario, rig.nodeBin)
	goResult := runShellSide(t, rig, scenario, rig.goBin)
	for side, result := range map[string]*RunResult{"node": node, "go": goResult} {
		if result.ExitCode != scenario.Expect.ExitCode {
			t.Errorf("%s shell exit=%d, want %d\nstdout: %q\nstderr: %q", side, result.ExitCode, scenario.Expect.ExitCode, result.Stdout, result.Stderr)
		}
		if !strings.Contains(result.Stdout, "Welcome to the WP-CLI shell for the develop environment of parityapp (d.example)!") {
			t.Errorf("%s shell greeting missing: %q", side, result.Stdout)
		}
		if got := strings.Count(result.Stdout, "parityapp.develop:~$ "); got != 6 {
			t.Errorf("%s shell showed %d prompts, want 6: %q", side, got, result.Stdout)
		}
		for _, message := range []string{
			"Error: invalid command, please pass a valid WP-CLI command.",
			"Error: Test WP-CLI error",
			"Error: WP-CLI command failed with exit code 3",
		} {
			if got := strings.Count(result.Stdout, message); got != 1 {
				t.Errorf("%s shell printed %q %d times, want once: %q", side, message, got, result.Stdout)
			}
		}
	}
	if node.ExitCode != goResult.ExitCode {
		t.Errorf("shell exit code differs: node=%d go=%d", node.ExitCode, goResult.ExitCode)
	}
	nodeErr, err := normalizeStderr(node.Stderr, nil)
	if err != nil {
		t.Fatal(err)
	}
	goErr, err := normalizeStderr(goResult.Stderr, nil)
	if err != nil {
		t.Fatal(err)
	}
	if nodeErr != goErr {
		t.Errorf("shell stderr differs: node=%q go=%q", nodeErr, goErr)
	}
}

func runShellPTYSide(t *testing.T, rig *differentialRig, scenario *Scenario, bin, input string) *RunResult {
	t.Helper()
	appBody, err := os.ReadFile("../../testdata/parity/recordings/wp-websocket-shell/resolve-app.json")
	if err != nil {
		t.Fatal(err)
	}
	mock := &shellMock{appBody: appBody, poll: make(chan string, 2)}
	rig.serve(t, mock)

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, scenario.Argv...)
	cmd.Env = FixtureEnv(scenario.Env)
	terminal, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 100})
	if err != nil {
		t.Fatal(err)
	}
	defer terminal.Close()
	output := newShellOutput()
	go func() { _, _ = io.Copy(output, terminal) }()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	_ = waitForShellOutput(t, output, done, 0, "parityapp.develop:~$ ")
	if got := mock.commandsSeen(); len(got) != 0 {
		t.Errorf("PTY trigger before shell input: %q", got)
	}
	if _, err := io.WriteString(terminal, input); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		result := &RunResult{Stdout: output.String()}
		if err != nil {
			var exitErr *exec.ExitError
			if !errors.As(err, &exitErr) {
				t.Fatalf("PTY shell wait: %v", err)
			}
			result.ExitCode = exitErr.ExitCode()
		}
		if got := mock.commandsSeen(); len(got) != 0 {
			t.Errorf("PTY trigger on exit: %q", got)
		}
		return result
	case <-ctx.Done():
		t.Fatalf("PTY shell did not exit: %v\noutput: %q", ctx.Err(), output.String())
	}
	return nil
}

func TestWPWebsocketShellPTYDifferential(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketShellPTYDifferential", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	node := runShellPTYSide(t, rig, scenario, rig.nodeBin, "exit\r")
	goResult := runShellPTYSide(t, rig, scenario, rig.goBin, "exit\r")
	if node.ExitCode != 0 || goResult.ExitCode != 0 {
		t.Errorf("PTY shell exit: node=%d go=%d\nnode: %q\ngo: %q", node.ExitCode, goResult.ExitCode, node.Stdout, goResult.Stdout)
	}
	for side, result := range map[string]*RunResult{"node": node, "go": goResult} {
		if !strings.Contains(result.Stdout, "Welcome to the WP-CLI shell for the develop environment of parityapp (d.example)!") {
			t.Errorf("%s PTY shell greeting missing: %q", side, result.Stdout)
		}
	}
}

func TestWPWebsocketShellPTYCtrlC(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketShellPTYCtrlC", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	for side, bin := range map[string]string{"node": rig.nodeBin, "go": rig.goBin} {
		result := runShellPTYSide(t, rig, scenario, bin, "\x03")
		if result.ExitCode != 0 {
			t.Errorf("%s PTY Ctrl-C exit=%d, want 0; output: %q", side, result.ExitCode, result.Stdout)
		}
	}
}

func TestWPWebsocketShellRestoresTerminalOnSIGTERM(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketShellRestoresTerminalOnSIGTERM", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	appBody, err := os.ReadFile("../../testdata/parity/recordings/wp-websocket-shell/resolve-app.json")
	if err != nil {
		t.Fatal(err)
	}
	mock := &shellMock{appBody: appBody, poll: make(chan string, 2)}
	rig.serve(t, mock)

	master, slave, err := pty.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer master.Close()
	defer slave.Close()
	if err := pty.Setsize(master, &pty.Winsize{Rows: 24, Cols: 100}); err != nil {
		t.Fatal(err)
	}
	before, err := term.GetState(int(slave.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, rig.goBin, scenario.Argv...)
	cmd.Env = FixtureEnv(scenario.Env)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = slave, slave, slave
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	output := newShellOutput()
	go func() { _, _ = io.Copy(output, master) }()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	_ = waitForShellOutput(t, output, done, 0, "parityapp.develop:~$ ")
	during, err := term.GetState(int(slave.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(before, during) {
		t.Error("Go shell did not put the terminal in raw mode")
	}
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatalf("Go shell did not stop after SIGTERM: %v\noutput: %q", ctx.Err(), output.String())
	}
	after, err := term.GetState(int(slave.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Errorf("Go shell left the terminal in raw mode after SIGTERM")
	}
	if got := mock.commandsSeen(); len(got) != 0 {
		t.Errorf("SIGTERM caused a command trigger: %q", got)
	}
}

func TestWPWebsocketShellForwardsActiveCtrlC(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketShellForwardsActiveCtrlC", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	appBody, err := os.ReadFile("../../testdata/parity/recordings/wp-websocket-shell/resolve-app.json")
	if err != nil {
		t.Fatal(err)
	}
	mock := &shellMock{
		appBody: appBody, poll: make(chan string, 2),
		inputReady: make(chan struct{}), remoteBytes: make(chan byte, 16),
	}
	rig.serve(t, mock)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, rig.goBin, scenario.Argv...)
	cmd.Env = FixtureEnv(scenario.Env)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer stdin.Close()
	stdout, stderr := newShellOutput(), newShellOutput()
	cmd.Stdout, cmd.Stderr = stdout, stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	prompt := "parityapp.develop:~$ "
	_ = waitForShellOutput(t, stdout, done, 0, prompt)
	if _, err := io.WriteString(stdin, "wp eval read\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-mock.inputReady:
	case <-ctx.Done():
		t.Fatalf("remote stdin was not opened: %v\nstdout: %q\nstderr: %q", ctx.Err(), stdout.String(), stderr.String())
	}
	if _, err := stdin.Write([]byte{3}); err != nil {
		t.Fatal(err)
	}
	select {
	case b := <-mock.remoteBytes:
		if b != 3 {
			t.Errorf("remote stdin received %#x, want Ctrl-C (0x03)", b)
		}
	case <-ctx.Done():
		t.Fatalf("remote stdin did not receive Ctrl-C: %v\nstdout: %q", ctx.Err(), stdout.String())
	}
	pos := waitForShellOutput(t, stdout, done, 0, "Command cancelled by user")
	_ = waitForShellOutput(t, stdout, done, pos, prompt)
	if got := mock.commandsSeen(); len(got) != 1 || got[0] != "eval read" {
		t.Errorf("trigger commands = %q, want [eval read]", got)
	}
	if _, err := io.WriteString(stdin, "exit\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("shell exit after Ctrl-C: %v\nstdout: %q\nstderr: %q", err, stdout.String(), stderr.String())
		}
	case <-ctx.Done():
		t.Fatalf("shell did not exit after Ctrl-C then exit: %v\nstdout: %q", ctx.Err(), stdout.String())
	}
}

func TestWPWebsocketOneShotDelayedNonzeroExit(t *testing.T) {
	rig, skip := differentialAvailable(t)
	if skip != "" {
		t.Skip(LoudSkip("TestWPWebsocketOneShotDelayedNonzeroExit", skip))
	}
	scenario, err := LoadScenario("../../testdata/parity/wp-websocket-shell.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenario.Env = rig.scenarioEnv(scenario)
	appBody, err := os.ReadFile("../../testdata/parity/recordings/wp-websocket-shell/resolve-app.json")
	if err != nil {
		t.Fatal(err)
	}
	argv := []string{"@parityapp.develop", "--", "wp", "option", "get", "missing"}
	for side, bin := range map[string]string{"node": rig.nodeBin, "go": rig.goBin} {
		t.Run(side, func(t *testing.T) {
			mock := &shellMock{appBody: appBody, poll: make(chan string, 2)}
			rig.serve(t, mock)
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, bin, argv...)
			cmd.Env = FixtureEnv(scenario.Env)
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			err := cmd.Run()
			if ctx.Err() != nil {
				t.Fatalf("one-shot command timed out: %v\nstdout: %q\nstderr: %q", ctx.Err(), stdout.String(), stderr.String())
			}
			var exitErr *exec.ExitError
			if !errors.As(err, &exitErr) || exitErr.ExitCode() != 3 {
				t.Errorf("exit=%v, want code 3\nstdout: %q\nstderr: %q", err, stdout.String(), stderr.String())
			}
			if got := mock.commandsSeen(); len(got) != 1 || got[0] != `"option" "get" "missing"` {
				t.Errorf("trigger commands=%q, want a single quoted option get missing", got)
			}
		})
	}
}
