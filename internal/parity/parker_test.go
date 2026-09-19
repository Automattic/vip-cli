//go:build parity

package parity

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const parkerTestToken = "eyJhbGciOiJub25lIn0.eyJpZCI6MTAwMDB9.signature"

func parkerScenario(argv ...string) *Scenario {
	s := &Scenario{Name: "local-test", Argv: argv}
	s.Expect.ExitCode = 0
	return s
}

func TestLocalParkerScenarioFilesArePolicyCompliant(t *testing.T) {
	scenarios := loadLocalParkerScenarioMap(t)
	if err := ValidateParkerScenarioMatrix(scenarios); err != nil {
		t.Fatal(err)
	}
}

func TestLocalParkerScenarioMatrixRejectsDuplicateArgvCoverage(t *testing.T) {
	scenarios := loadLocalParkerScenarioMap(t)
	duplicate := *scenarios["app-list-table.yaml"]
	duplicate.Argv = []string{"whoami"}
	scenarios["app-list-table.yaml"] = &duplicate

	err := ValidateParkerScenarioMatrix(scenarios)
	if err == nil || !strings.Contains(err.Error(), "argv_mismatch") {
		t.Fatalf("error = %v, want argv_mismatch", err)
	}
}

func loadLocalParkerScenarioMap(t *testing.T) map[string]*Scenario {
	t.Helper()
	paths, err := filepath.Glob("../../testdata/parity-local/*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	scenarios := make(map[string]*Scenario, len(paths))
	for _, path := range paths {
		scenario, err := LoadScenario(path)
		if err != nil {
			t.Fatalf("LoadScenario(%s): %v", path, err)
		}
		scenarios[filepath.Base(path)] = scenario
	}
	return scenarios
}

func TestParkerTokenArgsDefaultsToSeededVIPAdmin(t *testing.T) {
	t.Setenv("VIP_PARKER_USER_ID", "")

	got := ParkerTokenArgs()
	want := []string{"1", "--cli"}
	if !equalStrings(got, want) {
		t.Fatalf("ParkerTokenArgs = %v, want %v", got, want)
	}
}

func TestParkerUserIDAcceptsNumericOverride(t *testing.T) {
	t.Setenv("VIP_PARKER_USER_ID", "12")

	if got := ParkerUserID(); got != "12" {
		t.Fatalf("ParkerUserID = %q, want %q", got, "12")
	}
}

func TestResolveParkerScenarioUsesOnlyDiscoveredContext(t *testing.T) {
	template := parkerScenario(parkerAliasPlaceholder, "config", "software", "get", "--format=json")
	ctx := ParkerContext{AppID: 42, AppName: "My-App", EnvID: 7, EnvIdentifier: "develop.demo"}

	resolved, err := ResolveParkerScenario(template, ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"@my-app.develop.demo", "config", "software", "get", "--format=json"}
	if !slices.Equal(resolved.Argv, want) {
		t.Fatalf("argv = %v, want %v", resolved.Argv, want)
	}
	if slices.Equal(template.Argv, resolved.Argv) {
		t.Fatal("ResolveParkerScenario mutated its template or did not resolve it")
	}
	if err := ValidateResolvedParkerScenario(resolved, ctx); err != nil {
		t.Fatal(err)
	}
}

func TestParkerPolicyRejectsUnsafeMetadataAndDrift(t *testing.T) {
	unsafe := [][]string{
		{parkerAliasPlaceholder, "logs"},
		{parkerAliasPlaceholder, "slowlogs"},
		{parkerAliasPlaceholder, "config", "envvar", "get", "SECRET"},
		{parkerAliasPlaceholder, "import", "sql", "status"},
		{parkerAliasPlaceholder, "cache", "purge-url", "https://example.test"},
		{"app", "list", "--format", "json"},
		{"whoami", "--debug"},
	}
	for _, argv := range unsafe {
		if err := ValidateParkerScenarioTemplate(parkerScenario(argv...)); err == nil {
			t.Errorf("unsafe argv unexpectedly allowed: %v", argv)
		}
	}

	for name, mutate := range map[string]func(*Scenario){
		"environment override": func(s *Scenario) { s.Env = map[string]string{"API_HOST": "https://api.wpvip.com"} },
		"recording":            func(s *Scenario) { s.Recording = "fixture.json" },
		"normalizer": func(s *Scenario) {
			s.Normalize.Stdout = []NormalizeRule{{Pattern: "x", Replacement: "y"}}
		},
		"expected drift": func(s *Scenario) { s.ExpectedDrift = &ExpectedDrift{Reason: "do not permit"} },
	} {
		t.Run(name, func(t *testing.T) {
			s := parkerScenario("whoami")
			mutate(s)
			if err := ValidateParkerScenarioTemplate(s); err == nil {
				t.Fatalf("%s unexpectedly allowed", name)
			}
		})
	}
}

func TestBuildParkerEnvPinsLoopbackAndClearsProxies(t *testing.T) {
	parent := []string{
		"PATH=/usr/bin",
		"API_HOST=https://api.wpvip.com",
		"VIP_TOKEN_OVERRIDE=old-token",
		"HTTP_PROXY=http://proxy.test",
		"http_proxy=http://lower-proxy.test",
		"VIP_PROXY=socks5://proxy.test",
	}
	env := envMap(BuildParkerEnv(parent, parkerTestToken))

	for key, want := range map[string]string{
		"PATH":                 "/usr/bin",
		"API_HOST":             ParkerAPIHost,
		"NODE_ENV":             "test",
		"GO_ENV":               "test",
		"DO_NOT_TRACK":         "1",
		"VIP_TOKEN_OVERRIDE":   parkerTestToken,
		"HTTP_PROXY":           "",
		"HTTPS_PROXY":          "",
		"ALL_PROXY":            "",
		"VIP_PROXY":            "",
		"SOCKS_PROXY":          "",
		"VIP_USE_SYSTEM_PROXY": "",
		"http_proxy":           "",
		"https_proxy":          "",
		"all_proxy":            "",
	} {
		if got := env[key]; got != want {
			t.Errorf("%s = %q, want %q", key, got, want)
		}
	}
}

func TestBuildParkerEnvScrubsAmbientColorControls(t *testing.T) {
	parent := []string{
		"PATH=/usr/bin",
		"COLORTERM=",
		"FORCE_COLOR=",
		"CLICOLOR=1",
		"CLICOLOR_FORCE=1",
		"NO_COLOR=1",
		"TERM=xterm-256color",
		"TERM_PROGRAM=iTerm.app",
		"TERM_PROGRAM_VERSION=3.5",
		"CI=true",
		"CI_NAME=codeship",
		"TEAMCITY_VERSION=2025.1",
	}
	env := envMap(BuildParkerEnv(parent, parkerTestToken))

	if got := env["TERM"]; got != "dumb" {
		t.Fatalf("TERM = %q, want %q", got, "dumb")
	}
	for _, key := range []string{
		"COLORTERM",
		"FORCE_COLOR",
		"CLICOLOR",
		"CLICOLOR_FORCE",
		"NO_COLOR",
		"TERM_PROGRAM",
		"TERM_PROGRAM_VERSION",
		"CI",
		"CI_NAME",
		"TEAMCITY_VERSION",
	} {
		if got, exists := env[key]; exists {
			t.Errorf("%s must be absent, got %q", key, got)
		}
	}
}

func TestParseParkerTokenOutput(t *testing.T) {
	got, err := ParseParkerTokenOutput([]byte("generating token\r\n" + parkerTestToken + "\r\n"))
	if err != nil {
		t.Fatalf("ParseParkerTokenOutput: %v", err)
	}
	if got != parkerTestToken {
		t.Fatalf("token = %q, want test token", got)
	}

	for _, out := range []string{
		"no token here",
		parkerTestToken + "\n" + parkerTestToken,
		"almost.a-token",
	} {
		_, err := ParseParkerTokenOutput([]byte(out))
		if err == nil {
			t.Fatalf("ParseParkerTokenOutput(%q) unexpectedly succeeded", out)
		}
		if strings.Contains(err.Error(), out) || strings.Contains(err.Error(), parkerTestToken) {
			t.Fatalf("error leaked helper output or token: %v", err)
		}
	}
}

func TestRedactSecrets(t *testing.T) {
	unknownJWT := "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6N30.unexpected-signature"
	in := "authorization failed for " + parkerTestToken + " and second-secret; nested: " + unknownJWT
	got := RedactSecrets(in, parkerTestToken, "second-secret", "")
	if strings.Contains(got, parkerTestToken) || strings.Contains(got, "second-secret") || strings.Contains(got, unknownJWT) {
		t.Fatalf("RedactSecrets leaked a secret: %q", got)
	}
	if strings.Count(got, "<redacted>") != 2 || !strings.Contains(got, "<redacted-jwt>") {
		t.Fatalf("RedactSecrets = %q", got)
	}
}

func TestFormatParkerDiffRedactsThenBoundsEachDelta(t *testing.T) {
	secretAtCutoff := strings.Repeat("x", 4080) + parkerTestToken + strings.Repeat("y", 5000)
	diff := &DiffResult{
		ExitCodeDelta: strings.Repeat("e", 5000),
		StdoutDelta:   secretAtCutoff,
		StderrDelta:   secretAtCutoff,
	}
	got := formatParkerDiff(diff, parkerTestToken)
	assertBoundedSecretDiagnostic(t, got, 3)
}

func TestFormatParkerRunDiagnosticsRedactsThenBoundsEachStream(t *testing.T) {
	secretAtCutoff := strings.Repeat("x", 4080) + parkerTestToken + strings.Repeat("y", 5000)
	got := formatParkerRunDiagnostics(
		&RunResult{Stdout: secretAtCutoff, Stderr: secretAtCutoff},
		&RunResult{Stdout: secretAtCutoff, Stderr: secretAtCutoff},
		parkerTestToken,
	)
	assertBoundedSecretDiagnostic(t, got, 4)
}

func assertBoundedSecretDiagnostic(t *testing.T, got string, sections int) {
	t.Helper()
	for _, secretFragment := range []string{
		parkerTestToken,
		strings.Split(parkerTestToken, ".")[0],
		strings.Split(parkerTestToken, ".")[1],
	} {
		if strings.Contains(got, secretFragment) {
			t.Fatalf("diagnostic leaked token material %q", secretFragment)
		}
	}
	if count := strings.Count(got, "<truncated>"); count != sections {
		t.Fatalf("truncation markers = %d, want %d", count, sections)
	}
	const perSectionLimit = 4096 + len("\n<truncated>")
	if max := sections*perSectionLimit + 256; len(got) > max {
		t.Fatalf("diagnostic length = %d, want <= %d", len(got), max)
	}
}

func TestAssessDrift(t *testing.T) {
	tests := []struct {
		name         string
		equal        bool
		drift        *ExpectedDrift
		wantExpected bool
		wantErr      bool
	}{
		{name: "equal", equal: true},
		{name: "unexpected difference", equal: false, wantErr: true},
		{name: "expected difference", equal: false, drift: &ExpectedDrift{Reason: "known ordering difference"}, wantExpected: true},
		{name: "stale annotation", equal: true, drift: &ExpectedDrift{Reason: "known ordering difference"}, wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := parkerScenario("whoami")
			s.ExpectedDrift = tc.drift
			got, err := AssessDrift(s, &DiffResult{Equal: tc.equal})
			if (err != nil) != tc.wantErr {
				t.Fatalf("AssessDrift error = %v, wantErr %v", err, tc.wantErr)
			}
			if got != tc.wantExpected {
				t.Fatalf("AssessDrift expected = %v, want %v", got, tc.wantExpected)
			}
		})
	}
}

func TestCheckParkerPreflightDoesNotRunCLIOnFailure(t *testing.T) {
	generated := 0
	discovered := 0
	runs := 0
	summary, err := RunParkerScenarios(
		context.Background(),
		[]*Scenario{parkerScenario("whoami")},
		"node-vip", "go-vip", nil,
		ParkerRunDeps{
			Preflight: func(context.Context) error { return errors.New("not ready") },
			GenerateToken: func(context.Context) (string, error) {
				generated++
				return parkerTestToken, nil
			},
			DiscoverContext: func(context.Context, string) (ParkerContext, error) {
				discovered++
				return ParkerContext{}, nil
			},
			RunBinary: func(RunSpec) (*RunResult, error) {
				runs++
				return &RunResult{}, nil
			},
		},
	)
	if err == nil {
		t.Fatal("preflight failure must be returned")
	}
	if generated != 0 || discovered != 0 || runs != 0 {
		t.Fatalf("preflight failure generated=%d discovered=%d runs=%d, want zero", generated, discovered, runs)
	}
	if summary != (ParkerSummary{}) {
		t.Fatalf("summary = %+v, want zero", summary)
	}
}

func TestRunParkerScenariosStopsBeforeCLIOnDiscoveryFailure(t *testing.T) {
	var order []string
	_, err := RunParkerScenarios(
		context.Background(),
		[]*Scenario{parkerScenario("whoami")},
		"node-vip", "go-vip", nil,
		ParkerRunDeps{
			Preflight: func(context.Context) error {
				order = append(order, "preflight")
				return nil
			},
			GenerateToken: func(context.Context) (string, error) {
				order = append(order, "token")
				return parkerTestToken, nil
			},
			DiscoverContext: func(context.Context, string) (ParkerContext, error) {
				order = append(order, "discover")
				return ParkerContext{}, errors.New("no context")
			},
			RunBinary: func(RunSpec) (*RunResult, error) {
				order = append(order, "run")
				return &RunResult{}, nil
			},
		},
	)
	if err == nil {
		t.Fatal("expected discovery error")
	}
	if !slices.Equal(order, []string{"preflight", "token", "discover"}) {
		t.Fatalf("order = %v", order)
	}
}

func TestRunParkerScenariosUsesOnePinnedEnvironment(t *testing.T) {
	var specs []RunSpec
	discoveries := 0
	ctx := ParkerContext{AppID: 42, AppName: "My-App", EnvID: 7, EnvIdentifier: "develop.demo"}
	summary, err := RunParkerScenarios(
		context.Background(),
		[]*Scenario{
			parkerScenario("app", parkerAppIDPlaceholder, "--format=json"),
			parkerScenario(parkerAliasPlaceholder, "config", "software", "get", "--format=json"),
		},
		"node-vip", "go-vip", []string{"API_HOST=https://api.wpvip.com"},
		ParkerRunDeps{
			Preflight:     func(context.Context) error { return nil },
			GenerateToken: func(context.Context) (string, error) { return parkerTestToken, nil },
			DiscoverContext: func(context.Context, string) (ParkerContext, error) {
				discoveries++
				return ctx, nil
			},
			RunBinary: func(spec RunSpec) (*RunResult, error) {
				specs = append(specs, spec)
				return &RunResult{ExitCode: 0, Stdout: "same\n"}, nil
			},
		},
	)
	if err != nil {
		t.Fatalf("RunParkerScenarios: %v", err)
	}
	if summary.Compared != 2 || summary.Equal != 2 || summary.ExpectedDrift != 0 {
		t.Fatalf("summary = %+v", summary)
	}
	if discoveries != 1 {
		t.Fatalf("discoveries = %d, want 1", discoveries)
	}
	if len(specs) != 4 || specs[0].Binary != "node-vip" || specs[1].Binary != "go-vip" || specs[2].Binary != "node-vip" || specs[3].Binary != "go-vip" {
		t.Fatalf("run order = %+v", specs)
	}
	wantArgv := [][]string{
		{"app", "42", "--format=json"},
		{"app", "42", "--format=json"},
		{"@my-app.develop.demo", "config", "software", "get", "--format=json"},
		{"@my-app.develop.demo", "config", "software", "get", "--format=json"},
	}
	for i, spec := range specs {
		if !slices.Equal(spec.Argv, wantArgv[i]) {
			t.Fatalf("spec %d argv = %v, want %v", i, spec.Argv, wantArgv[i])
		}
	}
	for _, spec := range specs {
		env := envMap(spec.Env)
		if env["API_HOST"] != ParkerAPIHost || env["VIP_TOKEN_OVERRIDE"] != parkerTestToken {
			t.Fatalf("unpinned run env: %+v", env)
		}
	}
}

func TestRunParkerScenariosReportsAllUnexpectedDriftBeforeFailing(t *testing.T) {
	var runs int
	var reported []string
	summary, err := RunParkerScenarios(
		context.Background(),
		[]*Scenario{
			parkerScenario("whoami"),
			parkerScenario("app", "list", "--format=json"),
		},
		"node-vip", "go-vip", nil,
		ParkerRunDeps{
			Preflight:     func(context.Context) error { return nil },
			GenerateToken: func(context.Context) (string, error) { return parkerTestToken, nil },
			DiscoverContext: func(context.Context, string) (ParkerContext, error) {
				return ParkerContext{AppID: 1, AppName: "one", EnvID: 1, EnvIdentifier: "production"}, nil
			},
			RunBinary: func(spec RunSpec) (*RunResult, error) {
				runs++
				stdout := "same\n"
				if slices.Equal(spec.Argv, []string{"whoami"}) {
					stdout = spec.Binary + "\n"
				}
				return &RunResult{ExitCode: 0, Stdout: stdout}, nil
			},
			ReportDiff: func(name, _ string) { reported = append(reported, name) },
		},
	)
	if err == nil || !strings.Contains(err.Error(), "unexpected Node/Go drift") {
		t.Fatalf("error = %v, want aggregate drift failure", err)
	}
	if runs != 4 {
		t.Fatalf("runs = %d, want all 4 Node/Go runs", runs)
	}
	if summary.Compared != 2 || summary.Equal != 1 || summary.ExpectedDrift != 0 {
		t.Fatalf("summary = %+v, want compared=2 equal=1", summary)
	}
	if !slices.Equal(reported, []string{"local-test"}) {
		t.Fatalf("reported diffs = %v", reported)
	}
}

func envMap(env []string) map[string]string {
	out := make(map[string]string, len(env))
	for _, kv := range env {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			out[parts[0]] = parts[1]
		}
	}
	return out
}
