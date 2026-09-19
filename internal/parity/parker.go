//go:build parity

package parity

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	// ParkerAPIHost is `localhost`, NOT 127.0.0.1, and the distinction is
	// load-bearing. Node derives its keychain service name from API_HOST
	// (Token.getServiceName), so 127.0.0.1:4000 and localhost:4000 are two
	// DIFFERENT credentials for the same server. Nothing can seed the
	// 127.0.0.1 one: the parity keychain guard refuses it (port 4000 is below
	// the ephemeral floor) precisely because vip-go-cli:http---127-0-0-1-4000
	// is the namespace a developer's own local-Parker login lives in — writing
	// there would clobber it and the cleanup would delete it.
	//
	// `localhost` is where `vip login` against a local Parker actually puts the
	// token, so Node finds a real credential with no seeding at all. Both
	// resolve to the same loopback server; verified answering on both.
	ParkerAPIHost   = "http://localhost:4000"
	ParkerContainer = "parker_app"
	//nolint:gosec // G101: a path to a helper script, not a credential.
	ParkerTokenScript = "/Users/rinat/projects/vip-go-platform-stack/vip-go-api/api-wpvip-com/bin/generate-token.sh"
	// DefaultParkerUserID is the VIP Sys Admin in Parker's canonical seed data.
	// It is a default, not a pin: override it with VIP_PARKER_USER_ID when the
	// local seed changes.
	DefaultParkerUserID = "1"
	ParkerStartHelp     = "cd /Users/rinat/projects/vip-go-platform-stack/vip-go-api && docker-compose --profile parker up"
)

// ParkerUserID returns the local-Parker user the gate authenticates as.
//
// Only digits are accepted: the value is passed to generate-token.sh, and this
// keeps a stray shell metacharacter out of an argv that runs inside a
// container.
func ParkerUserID() string {
	if v := strings.TrimSpace(os.Getenv("VIP_PARKER_USER_ID")); v != "" {
		if _, err := strconv.Atoi(v); err == nil {
			return v
		}
	}
	return DefaultParkerUserID
}

var (
	parkerTokenLine = regexp.MustCompile(`^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$`)
	jwtInText       = regexp.MustCompile(`[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+`)

	// These variables can independently change whether Node or Go emits ANSI
	// escapes. They must be absent rather than empty: @colors/colors treats the
	// mere presence of COLORTERM and an empty FORCE_COLOR as color support.
	parkerColorEnvKeys = map[string]struct{}{
		"CI":                   {},
		"CI_NAME":              {},
		"CLICOLOR":             {},
		"CLICOLOR_FORCE":       {},
		"COLORTERM":            {},
		"FORCE_COLOR":          {},
		"NO_COLOR":             {},
		"TEAMCITY_VERSION":     {},
		"TERM_PROGRAM":         {},
		"TERM_PROGRAM_VERSION": {},
	}
)

const (
	parkerAppIDPlaceholder = "{{app_id}}"
	parkerAliasPlaceholder = "@{{app_name}}.{{env_identifier}}"
)

type ParkerContext struct {
	AppID         int64
	AppName       string
	EnvID         int64
	EnvIdentifier string
}

type parkerScenarioDefinition struct {
	FileName string
	Name     string
	Argv     []string
}

var localParkerScenarioMatrix = []parkerScenarioDefinition{
	{FileName: "app-get-csv.yaml", Name: "local-parker-app-get-csv", Argv: []string{"app", parkerAppIDPlaceholder, "--format=csv"}},
	{FileName: "app-get-json.yaml", Name: "local-parker-app-get-json", Argv: []string{"app", parkerAppIDPlaceholder, "--format=json"}},
	{FileName: "app-get-table.yaml", Name: "local-parker-app-get-table", Argv: []string{"app", parkerAppIDPlaceholder}},
	{FileName: "app-list-csv.yaml", Name: "local-parker-app-list-csv", Argv: []string{"app", "list", "--format=csv"}},
	{FileName: "app-list-json.yaml", Name: "local-parker-app-list-json", Argv: []string{"app", "list", "--format=json"}},
	{FileName: "app-list-table.yaml", Name: "local-parker-app-list-table", Argv: []string{"app", "list"}},
	{FileName: "envvar-list-csv.yaml", Name: "local-parker-envvar-list-csv", Argv: []string{parkerAliasPlaceholder, "config", "envvar", "list", "--format=csv"}},
	{FileName: "envvar-list-ids.yaml", Name: "local-parker-envvar-list-ids", Argv: []string{parkerAliasPlaceholder, "config", "envvar", "list", "--format=ids"}},
	{FileName: "envvar-list-json.yaml", Name: "local-parker-envvar-list-json", Argv: []string{parkerAliasPlaceholder, "config", "envvar", "list", "--format=json"}},
	{FileName: "envvar-list-keyvalue.yaml", Name: "local-parker-envvar-list-keyvalue", Argv: []string{parkerAliasPlaceholder, "config", "envvar", "list", "--format=keyValue"}},
	{FileName: "envvar-list-table.yaml", Name: "local-parker-envvar-list-table", Argv: []string{parkerAliasPlaceholder, "config", "envvar", "list"}},
	{FileName: "software-get-csv.yaml", Name: "local-parker-software-get-csv", Argv: []string{parkerAliasPlaceholder, "config", "software", "get", "--format=csv"}},
	{FileName: "software-get-json.yaml", Name: "local-parker-software-get-json", Argv: []string{parkerAliasPlaceholder, "config", "software", "get", "--format=json"}},
	{FileName: "software-get-table.yaml", Name: "local-parker-software-get-table", Argv: []string{parkerAliasPlaceholder, "config", "software", "get"}},
	{FileName: "whoami.yaml", Name: "local-parker-whoami", Argv: []string{"whoami"}},
}

func (c ParkerContext) Alias() string {
	return "@" + strings.ToLower(c.AppName) + "." + strings.ToLower(c.EnvIdentifier)
}

func ParkerTokenArgs() []string {
	return []string{ParkerUserID(), "--cli"}
}

func parkerAllowedArgv(appID, alias string) [][]string {
	allowed := make([][]string, 0, len(localParkerScenarioMatrix))
	for _, definition := range localParkerScenarioMatrix {
		argv := append([]string(nil), definition.Argv...)
		for i, arg := range argv {
			switch arg {
			case parkerAppIDPlaceholder:
				argv[i] = appID
			case parkerAliasPlaceholder:
				argv[i] = alias
			}
		}
		allowed = append(allowed, argv)
	}
	return allowed
}

func ValidateParkerScenarioMatrix(scenarios map[string]*Scenario) error {
	if len(scenarios) != len(localParkerScenarioMatrix) {
		return fmt.Errorf("local Parker scenario matrix count=%d, want %d", len(scenarios), len(localParkerScenarioMatrix))
	}
	seenArgv := make(map[string]string, len(localParkerScenarioMatrix))
	seenNames := make(map[string]string, len(localParkerScenarioMatrix))
	for _, definition := range localParkerScenarioMatrix {
		argvKey := strings.Join(definition.Argv, "\x00")
		if previous, exists := seenArgv[argvKey]; exists {
			return fmt.Errorf("local Parker canonical matrix duplicate argv in %s and %s", previous, definition.FileName)
		}
		seenArgv[argvKey] = definition.FileName
		if previous, exists := seenNames[definition.Name]; exists {
			return fmt.Errorf("local Parker canonical matrix duplicate name in %s and %s", previous, definition.FileName)
		}
		seenNames[definition.Name] = definition.FileName

		scenario, exists := scenarios[definition.FileName]
		if !exists {
			return fmt.Errorf("local Parker scenario matrix missing %s", definition.FileName)
		}
		if err := validateParkerScenarioCommon(scenario); err != nil {
			return err
		}
		if scenario.Name != definition.Name {
			return fmt.Errorf("local Parker scenario %s name_mismatch", definition.FileName)
		}
		if !equalStrings(scenario.Argv, definition.Argv) {
			return fmt.Errorf("local Parker scenario %s argv_mismatch", definition.FileName)
		}
	}
	return nil
}

func validateParkerScenarioCommon(s *Scenario) error {
	if s == nil {
		return errors.New("local Parker scenario is nil")
	}
	if strings.TrimSpace(s.Name) == "" {
		return errors.New("local Parker scenario requires a name")
	}
	if len(s.Env) != 0 {
		return fmt.Errorf("local Parker scenario %q must not override environment variables", s.Name)
	}
	if s.Recording != "" {
		return fmt.Errorf("local Parker scenario %q must not use recordings", s.Name)
	}
	if len(s.Normalize.Stdout) != 0 || len(s.Normalize.Stderr) != 0 {
		return fmt.Errorf("local Parker scenario %q must compare unnormalized output", s.Name)
	}
	if s.Expect.ExitCode != 0 {
		return fmt.Errorf("local Parker scenario %q must expect exit code 0", s.Name)
	}
	if s.ExpectedDrift != nil {
		return fmt.Errorf("local Parker scenario %q must not declare expected drift", s.Name)
	}
	return nil
}

func validateParkerArgv(s *Scenario, allowed [][]string) error {
	if err := validateParkerScenarioCommon(s); err != nil {
		return err
	}
	for _, argv := range allowed {
		if equalStrings(s.Argv, argv) {
			return nil
		}
	}
	return fmt.Errorf("local Parker scenario %q uses non-allowlisted argv", s.Name)
}

func ValidateParkerScenarioTemplate(s *Scenario) error {
	return validateParkerArgv(s, parkerAllowedArgv(parkerAppIDPlaceholder, parkerAliasPlaceholder))
}

// ValidateParkerScenario is kept as the template-policy entry point for the
// existing live loader. The runner switches to the explicit template and
// resolved validators once context discovery is wired.
func ValidateParkerScenario(s *Scenario) error {
	return ValidateParkerScenarioTemplate(s)
}

func ResolveParkerScenario(s *Scenario, ctx ParkerContext) (*Scenario, error) {
	if err := ValidateParkerScenarioTemplate(s); err != nil {
		return nil, err
	}
	resolved := *s
	resolved.Argv = append([]string(nil), s.Argv...)
	for i, arg := range resolved.Argv {
		switch arg {
		case parkerAppIDPlaceholder:
			resolved.Argv[i] = strconv.FormatInt(ctx.AppID, 10)
		case parkerAliasPlaceholder:
			resolved.Argv[i] = ctx.Alias()
		}
	}
	if err := ValidateResolvedParkerScenario(&resolved, ctx); err != nil {
		return nil, err
	}
	return &resolved, nil
}

func ValidateResolvedParkerScenario(s *Scenario, ctx ParkerContext) error {
	if ctx.AppID <= 0 || ctx.EnvID <= 0 || strings.TrimSpace(ctx.AppName) == "" || strings.TrimSpace(ctx.EnvIdentifier) == "" {
		return errors.New("local Parker resolved scenario requires a complete discovered context")
	}
	return validateParkerArgv(s, parkerAllowedArgv(strconv.FormatInt(ctx.AppID, 10), ctx.Alias()))
}

// BuildParkerEnv builds the environment for the live local-Parker gate.
//
// API_HOST stays on localhost so Node reads its normal local-Parker credential
// from the stable keychain namespace. The generated token authenticates Go and
// context discovery through the test-only override; the harness deliberately
// does not write or clean Node's stable developer credential. Color controls
// are scrubbed and TERM is pinned so byte comparisons do not depend on the
// launching terminal or CI provider.
func BuildParkerEnv(parent []string, token string) []string {
	overrides := map[string]string{
		"API_HOST":             ParkerAPIHost,
		"NODE_ENV":             "test",
		"GO_ENV":               "test",
		"DO_NOT_TRACK":         "1",
		"VIP_TOKEN_OVERRIDE":   token,
		"HTTP_PROXY":           "",
		"HTTPS_PROXY":          "",
		"ALL_PROXY":            "",
		"VIP_PROXY":            "",
		"SOCKS_PROXY":          "",
		"TERM":                 "dumb",
		"VIP_USE_SYSTEM_PROXY": "",
		"http_proxy":           "",
		"https_proxy":          "",
		"all_proxy":            "",
	}

	out := make([]string, 0, len(parent)+len(overrides))
	for _, kv := range parent {
		key, _, ok := strings.Cut(kv, "=")
		if !ok {
			continue
		}
		if _, scrubbed := parkerColorEnvKeys[key]; scrubbed {
			continue
		}
		if _, pinned := overrides[key]; !pinned {
			out = append(out, kv)
		}
	}
	keys := make([]string, 0, len(overrides))
	for key := range overrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out = append(out, key+"="+overrides[key])
	}
	return out
}

func ParseParkerTokenOutput(out []byte) (string, error) {
	var matches []string
	for _, line := range strings.Split(strings.ReplaceAll(string(out), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if parkerTokenLine.MatchString(line) {
			matches = append(matches, line)
		}
	}
	if len(matches) != 1 {
		return "", errors.New("local Parker token helper did not return exactly one JWT")
	}
	return matches[0], nil
}

func RedactSecrets(value string, secrets ...string) string {
	for _, secret := range secrets {
		if secret != "" {
			value = strings.ReplaceAll(value, secret, "<redacted>")
		}
	}
	return jwtInText.ReplaceAllString(value, "<redacted-jwt>")
}

func AssessDrift(s *Scenario, diff *DiffResult) (expected bool, err error) {
	if s == nil || diff == nil {
		return false, errors.New("cannot assess local Parker drift without a scenario and diff")
	}
	if s.ExpectedDrift != nil && strings.TrimSpace(s.ExpectedDrift.Reason) == "" {
		return false, fmt.Errorf("scenario %q expected drift requires a reason", s.Name)
	}
	if diff.Equal {
		if s.ExpectedDrift != nil {
			return false, fmt.Errorf("scenario %q has a stale expected-drift annotation", s.Name)
		}
		return false, nil
	}
	if s.ExpectedDrift != nil {
		return true, nil
	}
	return false, fmt.Errorf("scenario %q has unexpected Node/Go drift", s.Name)
}

type ParkerRunDeps struct {
	Preflight       func(context.Context) error
	GenerateToken   func(context.Context) (string, error)
	DiscoverContext func(context.Context, string) (ParkerContext, error)
	RunBinary       func(RunSpec) (*RunResult, error)
	ReportDiff      func(name, redactedDiff string)
}

type ParkerSummary struct {
	Compared      int
	Equal         int
	ExpectedDrift int
}

func RunParkerScenarios(
	ctx context.Context,
	scenarios []*Scenario,
	nodeBin, goBin string,
	parentEnv []string,
	deps ParkerRunDeps,
) (ParkerSummary, error) {
	var summary ParkerSummary
	var unexpectedDrift []string
	for _, scenario := range scenarios {
		if err := ValidateParkerScenarioTemplate(scenario); err != nil {
			return summary, err
		}
	}
	if deps.Preflight == nil || deps.GenerateToken == nil || deps.DiscoverContext == nil || deps.RunBinary == nil {
		return summary, errors.New("local Parker runner dependencies are incomplete")
	}
	if err := deps.Preflight(ctx); err != nil {
		return summary, fmt.Errorf("local Parker preflight failed: %w", err)
	}
	token, err := deps.GenerateToken(ctx)
	if err != nil {
		return summary, fmt.Errorf("local Parker token generation failed for user %s (override with VIP_PARKER_USER_ID)", ParkerUserID())
	}
	if !parkerTokenLine.MatchString(token) {
		return summary, fmt.Errorf("local Parker token generation failed for user %s (override with VIP_PARKER_USER_ID)", ParkerUserID())
	}
	discovered, err := deps.DiscoverContext(ctx, token)
	if err != nil {
		return summary, fmt.Errorf("local Parker context discovery failed: %s", RedactSecrets(err.Error(), token))
	}
	resolved := make([]*Scenario, 0, len(scenarios))
	for _, template := range scenarios {
		scenario, err := ResolveParkerScenario(template, discovered)
		if err != nil {
			return summary, err
		}
		resolved = append(resolved, scenario)
	}
	env := BuildParkerEnv(parentEnv, token)

	for _, scenario := range resolved {
		nodeResult, err := deps.RunBinary(RunSpec{
			Binary: nodeBin,
			Argv:   append([]string(nil), scenario.Argv...),
			Env:    append([]string(nil), env...),
		})
		if err != nil {
			return summary, fmt.Errorf("scenario %q Node execution failed: %s", scenario.Name, RedactSecrets(err.Error(), token))
		}
		goResult, err := deps.RunBinary(RunSpec{
			Binary: goBin,
			Argv:   append([]string(nil), scenario.Argv...),
			Env:    append([]string(nil), env...),
		})
		if err != nil {
			return summary, fmt.Errorf("scenario %q Go execution failed: %s", scenario.Name, RedactSecrets(err.Error(), token))
		}
		if nodeResult == nil || goResult == nil {
			return summary, fmt.Errorf("scenario %q runner returned no result", scenario.Name)
		}
		if nodeResult.ExitCode != scenario.Expect.ExitCode || goResult.ExitCode != scenario.Expect.ExitCode {
			return summary, fmt.Errorf(
				"scenario %q exit codes Node=%d Go=%d, want %d\n%s",
				scenario.Name, nodeResult.ExitCode, goResult.ExitCode, scenario.Expect.ExitCode,
				formatParkerRunDiagnostics(nodeResult, goResult, token),
			)
		}
		diff, err := Diff(scenario, nodeResult, goResult)
		if err != nil {
			return summary, fmt.Errorf("scenario %q diff failed: %w", scenario.Name, err)
		}
		summary.Compared++
		if !diff.Equal && deps.ReportDiff != nil {
			deps.ReportDiff(scenario.Name, formatParkerDiff(diff, token))
		}
		expected, err := AssessDrift(scenario, diff)
		if err != nil {
			if !diff.Equal {
				unexpectedDrift = append(unexpectedDrift, scenario.Name)
				continue
			}
			return summary, err
		}
		if expected {
			summary.ExpectedDrift++
		} else {
			summary.Equal++
		}
	}
	if len(unexpectedDrift) > 0 {
		return summary, fmt.Errorf(
			"unexpected Node/Go drift in %d scenario(s): %s",
			len(unexpectedDrift), strings.Join(unexpectedDrift, ", "),
		)
	}
	return summary, nil
}

func equalStrings(a, b []string) bool {
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

func formatParkerDiff(diff *DiffResult, secrets ...string) string {
	var parts []string
	for _, delta := range []string{diff.ExitCodeDelta, diff.StdoutDelta, diff.StderrDelta} {
		if delta != "" {
			parts = append(parts, boundedParkerDiagnostic(delta, secrets...))
		}
	}
	return strings.Join(parts, "\n")
}

func formatParkerRunDiagnostics(nodeResult, goResult *RunResult, secrets ...string) string {
	return fmt.Sprintf(
		"Node stdout:\n%s\nNode stderr:\n%s\nGo stdout:\n%s\nGo stderr:\n%s",
		boundedParkerDiagnostic(nodeResult.Stdout, secrets...), boundedParkerDiagnostic(nodeResult.Stderr, secrets...),
		boundedParkerDiagnostic(goResult.Stdout, secrets...), boundedParkerDiagnostic(goResult.Stderr, secrets...),
	)
}

func boundedParkerDiagnostic(value string, secrets ...string) string {
	return truncateDiagnostic(RedactSecrets(value, secrets...))
}

func truncateDiagnostic(value string) string {
	const max = 4096
	if len(value) <= max {
		return value
	}
	return value[:max] + "\n<truncated>"
}
