package sqlvalidation

import (
	"strings"
	"testing"
)

// devEnvOptions mirrors the option set Node's dev-env import passes
// (src/commands/dev-env-import-sql.ts:96-100): skipChecks is EMPTY (for a
// mysqldump), which overrides DEFAULT_VALIDATION_OPTIONS.skipChecks and turns
// the two DEV_ENV_SPECIFIC_CHECKS back on, plus the expected local domain as
// siteHomeUrlLando's extraCheckParam.
func devEnvOptions(domain string) Options {
	return Options{ExtraCheckParams: map[string]string{CheckSiteHomeURLLando: domain}}
}

func TestDevEnvOptionsRegisterUseStatement(t *testing.T) {
	res, err := ValidateWith(strings.NewReader("USE my_database;\n"), devEnvOptions("e.vipdev.site"), nil)
	if err != nil {
		t.Fatalf("ValidateWith: %v", err)
	}
	c := findCheck(t, res, CheckUseStatement)
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("useStatement: got %#v, want one result on line 1", c.Results)
	}
}

func TestDevEnvUseStatementIsCaseInsensitiveAndAnchored(t *testing.T) {
	res, _ := ValidateWith(strings.NewReader("use other_db;\nSELECT 'USE something';\n"), devEnvOptions("e.vipdev.site"), nil)
	c := findCheck(t, res, CheckUseStatement)
	if len(c.Results) != 1 || c.Results[0].Line != 1 {
		t.Errorf("useStatement: got %#v, want only the anchored line 1 match", c.Results)
	}
}

// Node sql.ts:344-369. A siteurl/home pointing anywhere but the local domain
// is the finding that matters most for dev-env: importing production SQL
// without a search-replace leaves the LOCAL site redirecting to production.
func TestDevEnvSiteHomeURLLandoFlagsForeignDomain(t *testing.T) {
	in := strings.NewReader(`INSERT INTO wp_options VALUES (1,'siteurl','https://example.com');` + "\n")
	res, _ := ValidateWith(in, devEnvOptions("e.vipdev.site"), nil)
	c := findCheck(t, res, CheckSiteHomeURLLando)
	if len(c.Results) != 1 {
		t.Fatalf("siteHomeUrlLando: got %#v, want 1 result", c.Results)
	}
	got := c.Results[0]
	if got.FalsePositive {
		t.Errorf("foreign domain marked falsePositive: %#v", got)
	}
	if got.Line != 1 {
		t.Errorf("line = %d, want 1", got.Line)
	}
	want := `Use '--search-replace="example.com,e.vipdev.site"' switch to replace the domain`
	if got.Recommendation != want {
		t.Errorf("recommendation =\n %q\nwant %q", got.Recommendation, want)
	}
}

// Node's matchHandler returns { falsePositive: true } for three shapes; each
// must NOT produce a finding.
func TestDevEnvSiteHomeURLLandoFalsePositives(t *testing.T) {
	cases := []struct {
		name string
		sql  string
	}{
		// Not an absolute http(s) URL — Node's /^https?:\/\//i test fails.
		{"relative value", `INSERT INTO wp_options VALUES (1,'siteurl','/blog');`},
		// Scheme only: empty after stripping -> trim() is falsy.
		{"scheme only", `INSERT INTO wp_options VALUES (1,'home','https://');`},
		// Already points at the local environment.
		{"matches expected domain", `INSERT INTO wp_options VALUES (1,'home','https://e.vipdev.site');`},
		// Subdomain of the local environment still "includes" it.
		{"subdomain of expected", `INSERT INTO wp_options VALUES (1,'home','https://sub.e.vipdev.site/x');`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, _ := ValidateWith(strings.NewReader(tc.sql+"\n"), devEnvOptions("e.vipdev.site"), nil)
			c := findCheck(t, res, CheckSiteHomeURLLando)
			for _, r := range c.Results {
				if !r.FalsePositive {
					t.Errorf("expected falsePositive, got %#v", r)
				}
			}
		})
	}
}

// Node's matcher for this check has no /i flag, so it is case-SENSITIVE on the
// option name (unlike most other checks). Pinning it stops a future "cleanup"
// from adding (?i) and diverging.
func TestDevEnvSiteHomeURLLandoMatcherIsCaseSensitive(t *testing.T) {
	in := strings.NewReader(`INSERT INTO wp_options VALUES (1,'SITEURL','https://example.com');` + "\n")
	res, _ := ValidateWith(in, devEnvOptions("e.vipdev.site"), nil)
	if c := findCheck(t, res, CheckSiteHomeURLLando); len(c.Results) != 0 {
		t.Errorf("uppercase option name matched: %#v", c.Results)
	}
}

// SkipChecks is honoured: Node passes ['dropTable','dropDB'] for a MyDumper
// dump (dev-env-import-sql.ts:98).
func TestValidateWithSkipChecksOmitsChecks(t *testing.T) {
	opts := devEnvOptions("e.vipdev.site")
	opts.SkipChecks = []string{"dropTable", "dropDB"}
	res, _ := ValidateWith(strings.NewReader("DROP DATABASE wordpress;\n"), opts, nil)
	for _, c := range res.Checks {
		if c.Key == "dropTable" || c.Key == "dropDB" {
			t.Errorf("%s must not be registered when skipped", c.Key)
		}
	}
}

// REGRESSION GUARD for the platform path: `vip import validate-sql` and
// `vip import sql` run with DEFAULT_VALIDATION_OPTIONS, whose skipChecks is
// DEV_ENV_SPECIFIC_CHECKS. Neither dev-env check may ever appear there.
func TestPlatformValidateSkipsBothDevEnvChecks(t *testing.T) {
	sql := "USE my_database;\n" +
		`INSERT INTO wp_options VALUES (1,'siteurl','https://example.com');` + "\n"
	res, err := Validate(strings.NewReader(sql))
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	for _, c := range res.Checks {
		if c.Key == CheckUseStatement || c.Key == CheckSiteHomeURLLando {
			t.Errorf("%s must stay skipped on the platform validate-sql path", c.Key)
		}
	}
}

func TestPlatformOptionsSkipsDevEnvSpecificChecks(t *testing.T) {
	got := PlatformOptions().SkipChecks
	if len(got) != 2 || got[0] != CheckUseStatement || got[1] != CheckSiteHomeURLLando {
		t.Errorf("PlatformOptions().SkipChecks = %v, want %v", got, DevEnvSpecificChecks)
	}
}
