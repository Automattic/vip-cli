//go:build parity

// Package parity hosts the differential harness that runs vip-next (and,
// once M2 introduces real commands to diff, the Node vip binary) against
// scripted scenarios and compares their output.
//
// This file: scenario loading from YAML files in testdata/parity/.
package parity

import (
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type NormalizeRule struct {
	Pattern     string
	Replacement string
}

type ExpectedDrift struct {
	Reason    string `yaml:"reason"`
	Signature string `yaml:"signature"`
}

func (r *NormalizeRule) UnmarshalYAML(node *yaml.Node) error {
	var s string
	if err := node.Decode(&s); err != nil {
		return err
	}
	parts := strings.SplitN(s, " -> ", 2)
	if len(parts) != 2 {
		return fmt.Errorf("normalize rule %q must be 'pattern -> replacement'", s)
	}
	r.Pattern = parts[0]
	r.Replacement = parts[1]
	return nil
}

type Scenario struct {
	Name        string            `yaml:"name"`
	Description string            `yaml:"description"`
	Argv        []string          `yaml:"argv"`
	Env         map[string]string `yaml:"env"`
	Recording   string            `yaml:"recording"`
	Normalize   struct {
		Stdout []NormalizeRule `yaml:"stdout"`
		Stderr []NormalizeRule `yaml:"stderr"`
	} `yaml:"normalize"`
	Expect struct {
		ExitCode int `yaml:"exit_code"`
	} `yaml:"expect"`
	ExpectedDrift *ExpectedDrift `yaml:"expected_drift"`
}

func LoadScenario(path string) (*Scenario, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	s := &Scenario{}
	if err := yaml.Unmarshal(data, s); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if s.Name == "" {
		return nil, fmt.Errorf("scenario %s missing name", path)
	}
	if s.ExpectedDrift != nil && strings.TrimSpace(s.ExpectedDrift.Reason) == "" {
		return nil, fmt.Errorf("scenario %s expected_drift requires a non-empty reason", path)
	}
	if s.ExpectedDrift != nil {
		sig := strings.TrimSpace(s.ExpectedDrift.Signature)
		decoded, err := hex.DecodeString(sig)
		if err != nil || len(decoded) != 32 || sig != strings.ToLower(sig) {
			return nil, fmt.Errorf("scenario %s expected_drift requires a lowercase 64-character signature", path)
		}
	}
	return s, nil
}
