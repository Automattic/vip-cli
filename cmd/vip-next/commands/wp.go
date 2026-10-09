package commands

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/Khan/genqlient/graphql"
	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/vektah/gqlparser/v2/gqlerror"
	"golang.org/x/term"

	"github.com/Automattic/vip/internal/appctx"
	"github.com/Automattic/vip/internal/debuglog"
	"github.com/Automattic/vip/internal/exit"
	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/output"
	"github.com/Automattic/vip/internal/version"
	"github.com/Automattic/vip/internal/wpshell"
	"github.com/Automattic/vip/internal/wpssh"
	"github.com/Automattic/vip/internal/wpstream"
)

// wpYes is set by main.go's normalizeWPArgs extraction before Execute
// (DisableFlagParsing keeps cobra from parsing the --yes flag itself).
var wpYes bool

// SetWPYes records the extracted --yes flag. Called by main.go.
func SetWPYes(v bool) { wpYes = v }

func printWPError(out io.Writer, err error) error {
	var list gqlerror.List
	if errors.As(err, &list) {
		for _, item := range list {
			fmt.Fprintln(out, color.RedString("Error: "+item.Message))
		}
	} else {
		fmt.Fprintln(out, color.RedString("Error: "+err.Error()))
	}
	return exit.Handled(err)
}

// nodejsTypeIDs — NODEJS_SITE_TYPE_IDS (src/lib/constants/vipgo.ts:12).
var nodejsTypeIDs = map[int64]bool{3: true, 5: true, 7: true, 8: true}

// wpEnvInfo flattens WPEnvInfo: the per-env fields the wp command needs
// beyond what appctx resolves (Node appQuery — vip-wp.js:26).
type wpEnvInfo struct {
	AppTypeID         int64
	WpcliStrategy     string
	PrimaryDomainName string
}

func fetchWPEnvInfo(ctx context.Context, client graphql.Client, appID, envID int64) (*wpEnvInfo, error) {
	resp, err := gql.WPEnvInfo(ctx, client, appID, envID)
	if err != nil {
		return nil, err
	}
	info := &wpEnvInfo{}
	if resp == nil || resp.App == nil {
		return info, nil
	}
	if resp.App.TypeId != nil {
		info.AppTypeID = *resp.App.TypeId
	}
	if len(resp.App.Environments) > 0 && resp.App.Environments[0] != nil {
		env := resp.App.Environments[0]
		if env.WpcliStrategy != nil {
			info.WpcliStrategy = string(*env.WpcliStrategy)
		}
		if env.PrimaryDomain != nil {
			info.PrimaryDomainName = env.PrimaryDomain.Name
		}
	}
	return info, nil
}

// WPCmd returns `vip wp [args...]`.
//
// Node parity: src/bin/vip-wp.js. DisableFlagParsing so WP-CLI flags pass
// through; main.go's normalizeWPArgs handles the `--`/`--yes` reshaping.
func WPCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                "wp",
		Short:              "Run a WP-CLI command on an environment",
		Long:               "Run a WP-CLI command on a VIP Platform environment, or launch an interactive WP-CLI shell when no command is given.",
		DisableFlagParsing: true,
		Args:               cobra.ArbitraryArgs,
	}
	cfg := GetConfig()
	return appctx.Build(cmd,
		appctx.WithAppContext(cfg.AppCtxConfig),
		appctx.WithEnvContext(),
	).WithRun(runWP)
}

func runWP(cmd *cobra.Command, args []string) error {
	ae := appctx.FromContext(cmd.Context())
	if ae == nil {
		return errors.New("appctx not set; this is a wiring bug")
	}
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	info, err := fetchWPEnvInfo(gql.WithAllowGQLErrors(cmd.Context()), cfg.GQLClient, ae.App.ID, ae.Env.ID)
	if err != nil {
		return err
	}

	if nodejsTypeIDs[info.AppTypeID] {
		return errors.New("WP-CLI commands are not supported on Node.js environments.")
	}

	isSubShell := len(args) == 0

	if !isSubShell && ae.Env.Type == "production" && !wpYes {
		// Node parity (vip-wp.js:379-391): the production gate is a
		// confirm() with a one-row info table echoing the WP-CLI command
		// that is about to run, so the user approves the exact string that
		// will be dispatched. The value is built the same way the dispatch
		// layer builds it — requoteArgs(args) joined by spaces — so the two
		// can never drift.
		fmt.Fprintln(out, output.KeyValue([]output.Tuple{
			{Key: "command", Value: "wp " + strings.Join(wpshell.RequoteArgs(args), " ")},
		}))
		ok, perr := importConfirmPrompt(cmd,
			fmt.Sprintf("Are you sure you want to run this command on %s for site %s?",
				formatEnvironment(ae.Env.Type), ae.App.Name), false)
		if perr != nil || !ok {
			trackEvent("wpcli_confirm_cancel", nil)
			fmt.Fprintln(out, "Command cancelled")
			return nil
		}
	}

	if isSubShell && info.WpcliStrategy == "websocket" {
		return runWPShell(cmd, ae, info)
	}
	return dispatchWP(cmd, ae, info, args, isSubShell)
}

func runWPShell(cmd *cobra.Command, ae *appctx.AppEnv, info *wpEnvInfo) error {
	out := cmd.OutOrStdout()
	trackEvent("wpcli_command_execute", map[string]any{"method": "subshell"})
	fmt.Fprintf(out, "Welcome to the WP-CLI shell for the %s environment of %s (%s)!\n",
		formatEnvironment(ae.Env.Type), ae.App.Name, info.PrimaryDomainName)
	identifier := ae.Env.Type
	if ae.Env.Name != "" && ae.Env.Name != ae.Env.Type && ae.Env.AppId != ae.Env.ID {
		identifier += "." + ae.Env.Name
	}
	prompt := fmt.Sprintf("%s.%s:~$ ", ae.App.Name, identifier)
	originalCtx := cmd.Context()
	ctx, cancel := context.WithCancel(originalCtx)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	signalDone := make(chan struct{})
	var receivedSignal os.Signal
	go func() {
		defer close(signalDone)
		select {
		case receivedSignal = <-signals:
			cancel()
		case <-ctx.Done():
		}
	}()
	// Registered before terminal cleanup so restoration finishes before exit.
	defer func() {
		cancel()
		signal.Stop(signals)
		<-signalDone
		if receivedSignal != nil {
			exit.WithCode(128+int(receivedSignal.(syscall.Signal)), nil)
		}
	}()
	cmd.SetContext(ctx)
	defer cmd.SetContext(originalCtx)
	var interruptMu sync.Mutex
	commandActive := false
	interrupts := 0
	keyboardExit := false
	commandInterrupted := false
	input := wpshell.NewInput(ctx, cmd.InOrStdin(), func() bool {
		interruptMu.Lock()
		defer interruptMu.Unlock()
		interrupts++
		if !commandActive || interrupts > 1 {
			keyboardExit = true
			cancel()
			return true
		}
		// Forward the first Ctrl-C to remote stdin; closing only the local
		// connection does not establish that the remote command was stopped.
		commandInterrupted = true
		return false
	})
	reader := input.Reader(ctx)
	defer reader.Close()
	loop := &wpshell.REPL{
		Prompt: prompt,
		Run: func(command string) error {
			commandCtx, commandCancel := context.WithCancel(ctx)
			interruptMu.Lock()
			commandActive = true
			interrupts = 0
			commandInterrupted = false
			interruptMu.Unlock()
			cmd.SetContext(commandCtx)
			commandInput := input.Reader(commandCtx)
			err := runWPWebsocketCommand(cmd, ae, command, true, commandInput)
			commandCancel()
			_ = commandInput.Close()
			cmd.SetContext(ctx)
			interruptMu.Lock()
			commandActive = false
			interrupted := commandInterrupted
			interruptMu.Unlock()
			if interrupted && ctx.Err() == nil {
				fmt.Fprintln(out, "Command cancelled by user")
				return nil
			}
			if ctx.Err() != nil {
				return err
			}
			if err != nil {
				var handled interface{ AlreadyPrinted() bool }
				if !errors.As(err, &handled) || !handled.AlreadyPrinted() {
					fmt.Fprintln(out, color.RedString("Error: "+err.Error()))
				}
			}
			return err
		},
	}
	if stdin, ok := cmd.InOrStdin().(*os.File); ok && term.IsTerminal(int(stdin.Fd())) {
		state, err := term.MakeRaw(int(stdin.Fd()))
		if err != nil {
			return err
		}
		defer func() { _ = term.Restore(int(stdin.Fd()), state) }()
		terminal := term.NewTerminal(struct {
			io.Reader
			io.Writer
		}{reader, out}, prompt)
		if width, height, err := term.GetSize(int(stdin.Fd())); err == nil {
			_ = terminal.SetSize(width, height)
		}
		originalOut := out
		defer cmd.SetOut(originalOut)
		out = terminal
		cmd.SetOut(out)
		loop.ReadLine = func(continuation bool) (string, error) {
			if continuation {
				terminal.SetPrompt("")
			} else {
				terminal.SetPrompt(prompt)
			}
			return terminal.ReadLine()
		}
	}
	err := loop.Serve(bufio.NewReader(reader), out)
	interruptMu.Lock()
	defer interruptMu.Unlock()
	if keyboardExit {
		fmt.Fprintln(out, "Command cancelled by user")
		return nil
	}
	return err
}

// dispatchWP routes to the appropriate WP-CLI execution strategy based on
// info.WpcliStrategy. Ports vip-wp.js + wp-ssh.ts dispatch logic.
func dispatchWP(cmd *cobra.Command, ae *appctx.AppEnv, info *wpEnvInfo, args []string, isSubShell bool) error {
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	// 1. Websocket strategy: socket.io (WP2).
	if info.WpcliStrategy == "websocket" {
		return dispatchWPWebsocket(cmd, ae, info, args, isSubShell)
	}

	// 2. SSH strategy (all non-websocket strategies).
	//
	// Node-parity quirk: SSH envs run the joined command string even in
	// "subshell" mode (no args). wp-ssh.ts never enters a REPL — it always
	// calls executeCommandOverSSH with whatever cmd string it has, including
	// empty. So we do NOT use wpshell.REPL here; we build the string and run
	// once regardless.
	cmdStr := strings.Join(wpshell.RequoteArgs(args), " ")

	method := "shell"
	if isSubShell {
		method = "subshell"
	}
	trackEvent("wpcli_command_execute", map[string]any{"method": method})

	// Call TriggerWPCLICommand under WithAllowGQLErrors so GraphQL errors
	// come back to us instead of calling os.Exit via the middleware.
	triggerInput := &gql.AppEnvironmentTriggerWPCLICommandInput{
		Command:       &cmdStr,
		Id:            &ae.App.ID,
		EnvironmentId: &ae.Env.ID,
	}
	debuglog.Printf(cmd.Context(), "@automattic/vip:wp/ssh", "Requesting SSH authentication")
	triggerCtx := gql.WithAllowGQLErrors(cmd.Context())
	resp, err := gql.TriggerWPCLICommand(triggerCtx, cfg.GQLClient, triggerInput)
	if err != nil {
		// Surface GraphQL error in the same format other commands use for
		// allowed-error contexts: print "Error: <msg>" in red and return an
		// error so the caller sees a non-zero exit (sync.go:80 pattern).
		return printWPError(out, err)
	}

	payload := resp.GetTriggerWPCLICommandOnAppEnvironment()
	if payload == nil {
		err := errors.New("WP-CLI SSH Authentication failed")
		return printWPError(out, err)
	}

	sshAuth := payload.GetSshAuthentication()
	if sshAuth == nil {
		// wp-ssh.ts:114
		err := errors.New("WP-CLI SSH Authentication failed")
		return printWPError(out, err)
	}

	// Extract GUID and InputToken from the payload.
	var guid string
	if c := payload.GetCommand(); c != nil && c.GetGuid() != nil {
		guid = *c.GetGuid()
	}
	var inputToken string
	if t := payload.GetInputToken(); t != nil {
		inputToken = *t
	}

	auth := wpssh.Auth{
		Host:       sshAuth.GetHost(),
		Port:       sshAuth.GetPort(),
		Username:   sshAuth.GetUsername(),
		PrivateKey: sshAuth.GetPrivateKey(),
		Passphrase: sshAuth.GetPassphrase(),
		GUID:       guid,
		InputToken: inputToken,
	}

	// Determine terminal dimensions (sync.go pattern for term.IsTerminal /
	// term.GetSize). NON_TTY_ROWS/COLUMNS from wp-ssh.ts (15 / 100).
	tty := term.IsTerminal(int(os.Stdout.Fd()))
	rows, cols := 15, 100
	if tty {
		if w, h, err := term.GetSize(int(os.Stdout.Fd())); err == nil {
			cols = w
			rows = h
		}
	}

	// Signal handling: io.Pipe approach so SIGINT/SIGTERM cancel bytes can
	// be injected into the same stdin stream alongside real user input.
	// Node wp-ssh.ts:214-226: SIGINT → "\x03", SIGTERM → "\x1F".
	pr, pw := io.Pipe()
	// Copy real stdin into the write-end of the pipe in a goroutine.
	go func() {
		_, _ = io.Copy(pw, os.Stdin)
		_ = pw.Close()
	}()
	// Close the write-end on return so the SSH session's stdin reader sees
	// EOF and tears down cleanly. NOTE: the copy goroutine above blocks in
	// os.Stdin.Read, which Go cannot force-cancel; closing pw here unblocks
	// the consumer (pr) but the goroutine itself is only reaped on process
	// exit. Harmless for a one-shot CLI — Node's wp-ssh has the same
	// stdin-pipe limitation.
	defer func() { _ = pw.Close() }()

	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		for sig := range sigCh {
			// Node wp-ssh.ts:216-224 uses stream.end(byte): it writes the
			// cancel byte AND half-closes remote stdin so the server sees
			// EOF. Mirror that with a write followed by pw.Close() (the
			// deferred Close and the stdin-copy goroutine's Close are both
			// idempotent on an io.PipeWriter, so this is safe).
			switch sig {
			case syscall.SIGINT:
				fmt.Fprintln(os.Stderr, "SIGINT received. Canceling command...")
				_, _ = pw.Write([]byte("\x03"))
				_ = pw.Close()
			case syscall.SIGTERM:
				fmt.Fprintln(os.Stderr, "SIGTERM received. Canceling command...")
				_, _ = pw.Write([]byte("\x1F"))
				_ = pw.Close()
			}
		}
	}()
	defer func() {
		signal.Stop(sigCh)
		close(sigCh)
	}()

	meta := wpssh.Meta{
		Version: version.Version,
		Rows:    rows,
		Columns: cols,
		TTY:     tty,
	}
	streams := wpssh.Streams{
		Stdin:  pr,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	}

	runErr := wpssh.Run(cmd.Context(), auth, streams, meta)

	var ec *wpssh.ExitCodeError
	if errors.As(runErr, &ec) {
		trackEvent("wpcli_command_end", map[string]any{"method": method})
		exit.WithCode(ec.Code, nil)
		return nil // unreachable — exit.WithCode calls os.Exit
	}
	if runErr != nil {
		return runErr
	}

	trackEvent("wpcli_command_end", map[string]any{"method": method})
	return nil
}

// dispatchWPWebsocket handles the "websocket" wpcliStrategy by connecting to
// the environment over socket.io (internal/wpstream, WP2).
func dispatchWPWebsocket(cmd *cobra.Command, ae *appctx.AppEnv, _ *wpEnvInfo, args []string, isSubShell bool) error {
	return runWPWebsocketCommand(cmd, ae, strings.Join(wpshell.RequoteArgs(args), " "), isSubShell, cmd.InOrStdin())
}

func runWPWebsocketCommand(cmd *cobra.Command, ae *appctx.AppEnv, cmdStr string, isSubShell bool, stdin io.Reader) error {
	cfg := GetConfig()
	out := cmd.OutOrStdout()

	method := "shell"
	if isSubShell {
		method = "subshell"
	}
	if !isSubShell {
		trackEvent("wpcli_command_execute", map[string]any{"method": method})
	}

	// Call TriggerWPCLICommand under WithAllowGQLErrors so GraphQL errors come
	// back to us rather than triggering an os.Exit in the middleware.
	triggerInput := &gql.AppEnvironmentTriggerWPCLICommandInput{
		Command:       &cmdStr,
		Id:            &ae.App.ID,
		EnvironmentId: &ae.Env.ID,
	}
	triggerCtx := gql.WithAllowGQLErrors(cmd.Context())
	resp, err := gql.TriggerWPCLICommand(triggerCtx, cfg.GQLClient, triggerInput)
	if err != nil {
		if cmd.Context().Err() != nil {
			return cmd.Context().Err()
		}
		return printWPError(out, err)
	}

	payload := resp.GetTriggerWPCLICommandOnAppEnvironment()
	if payload == nil {
		err := errors.New("WP-CLI command trigger failed: empty payload")
		return printWPError(out, err)
	}

	// Extract GUID and InputToken from the payload.
	// NOTE: for websocket envs sshAuthentication will be null — we do NOT
	// require it (unlike the SSH branch).
	var guid string
	if c := payload.GetCommand(); c != nil && c.GetGuid() != nil {
		guid = *c.GetGuid()
	}
	var inputToken string
	if t := payload.GetInputToken(); t != nil {
		inputToken = *t
	}

	// Shell command readers wrap stdin without exposing its file descriptor.
	stdinTTY := false
	if input, ok := cmd.InOrStdin().(*os.File); ok {
		stdinTTY = term.IsTerminal(int(input.Fd()))
	}
	// Determine terminal dimensions (same defaults as SSH branch: 15 rows / 100 cols).
	stdoutTTY := term.IsTerminal(int(os.Stdout.Fd()))
	rows, cols := 15, 100
	if stdoutTTY {
		if w, h, err := term.GetSize(int(os.Stdout.Fd())); err == nil {
			cols = w
			rows = h
		}
	}

	res, runErr := wpstream.Run(cmd.Context(), wpstream.Options{
		APIHost:    cfg.APIHost,
		Token:      cfg.Token,
		GUID:       guid,
		InputToken: inputToken,
		Columns:    cols,
		Rows:       rows,
		IsTTY:      stdinTTY,
		Stdin:      stdin,
		Stdout:     out,
		Stderr:     cmd.ErrOrStderr(),
	})
	if runErr != nil {
		return runErr
	}
	trackEvent("wpcli_command_end", map[string]any{"method": method})
	if isSubShell {
		if res.ExitCode != 0 {
			return fmt.Errorf("WP-CLI command failed with exit code %d", res.ExitCode)
		}
		return nil
	}
	exit.WithCode(res.ExitCode, nil)
	return nil // unreachable — exit.WithCode calls os.Exit
}
