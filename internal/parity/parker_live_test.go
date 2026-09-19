//go:build parity && parker_parity

package parity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/creack/pty"
)

const parkerTokenOutputLimit = 16 * 1024

func TestLocalParkerParity(t *testing.T) {
	nodeBin, err := requiredExecutable("NODE_VIP_BIN")
	if err != nil {
		t.Fatalf("local Parker preflight failed: %v\nstart Parker with: %s", err, ParkerStartHelp)
	}
	goBin, err := requiredExecutable("GO_VIP_BIN")
	if err != nil {
		t.Fatalf("local Parker preflight failed: %v\nstart Parker with: %s", err, ParkerStartHelp)
	}

	paths, err := filepath.Glob("../../testdata/parity-local/*.yaml")
	if err != nil {
		t.Fatalf("glob local Parker scenarios: %v", err)
	}
	slices.Sort(paths)
	if len(paths) != 15 {
		t.Fatalf("local Parker scenario count=%d, want 15", len(paths))
	}
	scenarios := make([]*Scenario, 0, len(paths))
	scenarioByFile := make(map[string]*Scenario, len(paths))
	for _, path := range paths {
		scenario, err := LoadScenario(path)
		if err != nil {
			t.Fatalf("load local Parker scenario: %v", err)
		}
		scenarios = append(scenarios, scenario)
		scenarioByFile[filepath.Base(path)] = scenario
	}
	if err := ValidateParkerScenarioMatrix(scenarioByFile); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	summary, err := RunParkerScenarios(
		ctx, scenarios, nodeBin, goBin, os.Environ(),
		ParkerRunDeps{
			Preflight:       checkLocalParker,
			GenerateToken:   generateLocalParkerToken,
			DiscoverContext: discoverLocalParkerContext,
			RunBinary:       Run,
			ReportDiff: func(name, redactedDiff string) {
				t.Logf("local Parker diff for %s:\n%s", name, redactedDiff)
			},
		},
	)
	if err != nil {
		if strings.Contains(err.Error(), "local Parker preflight failed") {
			t.Fatalf("%v\nstart Parker with: %s", err, ParkerStartHelp)
		}
		t.Fatal(err)
	}
	if summary.Compared != 15 || summary.Equal != 15 || summary.ExpectedDrift != 0 {
		t.Fatalf("local Parker parity: compared=%d equal=%d expected-drift=%d, want 15/15/0",
			summary.Compared, summary.Equal, summary.ExpectedDrift)
	}
	t.Logf("local Parker parity: compared=%d equal=%d expected-drift=%d",
		summary.Compared, summary.Equal, summary.ExpectedDrift)
}

func requiredExecutable(envKey string) (string, error) {
	path := os.Getenv(envKey)
	if path == "" {
		return "", fmt.Errorf("%s is not set", envKey)
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("%s is unavailable", envKey)
	}
	if info.IsDir() || info.Mode()&0o111 == 0 {
		return "", fmt.Errorf("%s is not executable", envKey)
	}
	return path, nil
}

func checkLocalParker(ctx context.Context) error {
	out, err := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", ParkerContainer).Output()
	if err != nil {
		return fmt.Errorf("container %s is not inspectable", ParkerContainer)
	}
	var ports map[string][]struct {
		HostPort string `json:"HostPort"`
	}
	if err := json.Unmarshal(out, &ports); err != nil {
		return errors.New("container port bindings are not valid JSON")
	}
	found := false
	for _, binding := range ports["4000/tcp"] {
		if binding.HostPort == "4000" {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("container %s does not publish 4000/tcp on host port 4000", ParkerContainer)
	}

	client := &http.Client{
		Transport: &http.Transport{Proxy: nil},
		Timeout:   5 * time.Second,
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ParkerAPIHost, nil)
	if err != nil {
		return errors.New("could not construct the loopback Parker probe")
	}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("loopback Parker did not answer on 127.0.0.1:4000")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		return fmt.Errorf("loopback Parker returned HTTP %d, want 401", resp.StatusCode)
	}
	return nil
}

func generateLocalParkerToken(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, ParkerTokenScript, ParkerTokenArgs()...)
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return "", errors.New("token helper could not start")
	}
	defer ptmx.Close()

	out, readErr := io.ReadAll(io.LimitReader(ptmx, parkerTokenOutputLimit+1))
	if len(out) > parkerTokenOutputLimit {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return "", errors.New("token helper output exceeded the safety limit")
	}
	waitErr := cmd.Wait()
	if readErr != nil && !errors.Is(readErr, syscall.EIO) {
		return "", errors.New("token helper output could not be read")
	}
	if waitErr != nil {
		return "", errors.New("token helper failed")
	}
	return ParseParkerTokenOutput(out)
}
