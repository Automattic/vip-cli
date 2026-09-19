// Package wpssh ports the SSH WP-CLI execution strategy from
// src/commands/wp-ssh.ts (executeCommandOverSSH, lines 170-258).
// Signal handling is intentionally omitted — that belongs to the command
// layer which owns os.Signal channels.
package wpssh

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"

	"golang.org/x/crypto/ssh"
)

// SSH_HANDSHAKE_TIMEOUT_MS matches the Node constant (wp-ssh.ts:22).
const handshakeTimeout = 5e9 // 5 seconds in nanoseconds (time.Duration)

// Auth carries SSH credentials + command identifiers from the
// TriggerWPCLICommand mutation. Port is a string (schema: String!).
type Auth struct {
	Host, Port, Username string
	PrivateKey           string
	Passphrase           string
	GUID, InputToken     string
}

// Streams injects process stdio (real os.Stdin/out in production).
type Streams struct {
	Stdin          io.Reader
	Stdout, Stderr io.Writer
}

// Meta carries terminal dimensions + CLI version for the exec preamble.
type Meta struct {
	Version string
	Rows    int
	Columns int
	TTY     bool
}

// ExitCodeError signals a non-zero remote exit (wp-ssh.ts:59 NonZeroExitCodeError).
type ExitCodeError struct {
	Code int
	GUID string
}

func (e *ExitCodeError) Error() string {
	return fmt.Sprintf("command failed with exit code %d", e.Code)
}

// Run connects to the SSH server described by auth, execs the env-var preamble,
// pipes stdio for the duration, and returns any error.
// It is the port of executeCommandOverSSH (wp-ssh.ts:170-258).
func Run(ctx context.Context, auth Auth, streams Streams, meta Meta) error {
	signer, err := parseSigner(auth.PrivateKey, auth.Passphrase)
	if err != nil {
		return fmt.Errorf("wpssh: parse private key: %w", err)
	}

	cfg := &ssh.ClientConfig{
		User: auth.Username,
		Auth: []ssh.AuthMethod{ssh.PublicKeys(signer)},
		// Node's ssh2 does not verify host keys; the endpoint and credentials
		// originate from the authenticated VIP API, so we replicate that
		// behaviour here for Node parity.
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // #nosec G106
		Timeout:         handshakeTimeout,
	}

	addr := net.JoinHostPort(auth.Host, auth.Port)
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		return fmt.Errorf("wpssh: dial %s: %w", addr, err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("wpssh: new session: %w", err)
	}
	defer session.Close()

	session.Stdin = streams.Stdin
	session.Stdout = streams.Stdout
	session.Stderr = streams.Stderr

	// Build the env-var preamble exactly as wp-ssh.ts:199 does.
	ttyStr := "false"
	if meta.TTY {
		ttyStr = "true"
	}
	cmd := fmt.Sprintf(
		"GUID=%s INPUT_TOKEN=%s VERSION=%s ROWS=%d COLUMNS=%d TTY=%s",
		auth.GUID, auth.InputToken, meta.Version, meta.Rows, meta.Columns, ttyStr,
	)

	if err := session.Run(cmd); err != nil {
		var exitErr *ssh.ExitError
		if errors.As(err, &exitErr) {
			return &ExitCodeError{Code: exitErr.ExitStatus(), GUID: auth.GUID}
		}
		return fmt.Errorf("wpssh: run: %w", err)
	}
	return nil
}

// parseSigner parses an OpenSSH PEM private key, optionally decrypted with
// passphrase (wp-ssh.ts connect options: privateKey + passphrase).
func parseSigner(privateKeyPEM, passphrase string) (ssh.Signer, error) {
	keyBytes := []byte(privateKeyPEM)
	if passphrase != "" {
		return ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(passphrase))
	}
	return ssh.ParsePrivateKey(keyBytes)
}
