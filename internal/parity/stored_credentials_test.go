//go:build parity

package parity

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/auth"
	"github.com/Automattic/vip/internal/keychain"
	"github.com/Automattic/vip/internal/rechallenge"
)

func (r *differentialRig) ensureStoredCredentials(t *testing.T) {
	t.Helper()
	if r.storedCredentials {
		return
	}
	// Mark before either write so teardown also collects partial setup.
	r.storedCredentials = true
	if err := SeedNodeKeychainToken(r.nodeBin, r.srv.URL, r.token); err != nil {
		t.Fatalf("seed Node stored credential: %v", err)
	}
	if err := goKeychainOp(r.srv.URL, "seed", r.token); err != nil {
		t.Fatal(err)
	}
}

// Drive Go's real backend in a child with exactly the CLI fixture environment.
// In particular, ambient XDG and D-Bus settings must not select a different
// credential backend for the seed than for the command under test.
func goKeychainOp(apiHost, op, token string) error {
	if err := assertEphemeralParityService(op, keychain.ServiceNameForHost(apiHost)); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), nodeKeychainOpTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestGoKeychainHelperProcess$")
	cmd.Env = FixtureEnv(map[string]string{
		"API_HOST": apiHost, "VIP_CLI_TOKEN": "", "VIP_PARITY_GO_KEYCHAIN_OP": op,
	})
	cmd.Stdin = strings.NewReader(token)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Go credential fixture %s: %w: %s", op, err, out.String())
	}
	if !strings.Contains(out.String(), "VIP_PARITY_KEYCHAIN_OK") {
		return fmt.Errorf("Go credential fixture %s did not verify completion", op)
	}
	return nil
}

func cleanupStoredCredentials(nodeBin, apiHost string) error {
	return errors.Join(goKeychainOp(apiHost, "clear", ""), CleanupParityCredentials(nodeBin, apiHost))
}

func TestGoKeychainHelperProcess(t *testing.T) {
	op := os.Getenv("VIP_PARITY_GO_KEYCHAIN_OP")
	if op == "" {
		return
	}
	host := os.Getenv("API_HOST")
	if err := assertEphemeralParityService(op, keychain.ServiceNameForHost(host)); err != nil {
		t.Fatal(err)
	}
	k := keychain.New(host)
	switch op {
	case "seed", "verify":
		raw, err := io.ReadAll(os.Stdin)
		if err != nil || len(raw) == 0 {
			t.Fatal("missing fixture token on stdin")
		}
		store := auth.NewStore(k)
		if op == "seed" {
			if err := store.Save(string(raw)); err != nil {
				t.Fatal("could not save fixture token")
			}
		}
		if got, err := store.LoadPrimary(); err != nil || got != string(raw) {
			t.Fatal("stored fixture token did not read back")
		}
	case "clear":
		for _, entry := range [][2]string{
			{k.Service, k.Account()},
			{k.Service, k.Service + ":legacy-fallback-disabled"},
			{rechallenge.ServiceNameForHost(host), rechallenge.ServiceNameForHost(host)},
		} {
			if err := k.Backend.Delete(entry[0], entry[1]); err != nil && !errors.Is(err, keychain.ErrNotFound) {
				t.Fatal(err)
			}
		}
	default:
		t.Fatalf("unknown fixture operation %q", op)
	}
	fmt.Println("VIP_PARITY_KEYCHAIN_OK")
}
