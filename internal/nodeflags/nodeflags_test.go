package nodeflags

import "testing"

// Node: src/lib/dev-environment/dev-environment-cli.ts:939-946
//
//	export function processBooleanOption( value: unknown ): boolean {
//		if ( ! value ) { return false; }
//		return ! FALSE_OPTIONS.includes( value.toString().toLowerCase() );
//	}
//
// FALSE_OPTIONS = [ 'false', 'no', 'n', '0' ] (line 924).
func TestProcessBooleanOption(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		// FALSE_OPTIONS, case-insensitive.
		{"false", false}, {"FALSE", false},
		{"no", false}, {"No", false},
		{"n", false}, {"N", false},
		{"0", false},
		// TRUE_OPTIONS.
		{"true", true}, {"TRUE", true},
		{"yes", true}, {"y", true}, {"Y", true}, {"1", true},
		// Node does NOT error on unrecognized values: anything not in
		// FALSE_OPTIONS is true.
		{"maybe", true}, {"nope", true}, {"00", true}, {" n", true},
		// `! value` short-circuit: the empty string is falsy in JS.
		{"", false},
	}
	for _, c := range cases {
		if got := ProcessBooleanOption(c.in); got != c.want {
			t.Errorf("ProcessBooleanOption(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

// Node: dev-environment-cli.ts:948-961.
func TestProcessMediaRedirectDomainOption(t *testing.T) {
	for _, in := range []string{"false", "no", "n", "0", "N", "No"} {
		got, err := ProcessMediaRedirectDomainOption(in)
		if err != nil {
			t.Errorf("ProcessMediaRedirectDomainOption(%q) errored: %v", in, err)
		}
		if got != "" {
			t.Errorf("ProcessMediaRedirectDomainOption(%q) = %q, want \"\" (disabled)", in, got)
		}
	}
	for _, in := range []string{"true", "yes", "y", "1", "Y"} {
		if _, err := ProcessMediaRedirectDomainOption(in); err == nil {
			t.Errorf("ProcessMediaRedirectDomainOption(%q): want UserError, got nil", in)
		} else if err.Error() != "Media redirect domain must be a domain name or an URL" {
			t.Errorf("ProcessMediaRedirectDomainOption(%q) error = %q", in, err)
		}
	}
	// Anything else passes through verbatim, including the empty string
	// (Node: `( value ?? '' ).toString()` then falls through the two guards).
	for _, in := range []string{"example.go-vip.co", "https://example.com", ""} {
		got, err := ProcessMediaRedirectDomainOption(in)
		if err != nil || got != in {
			t.Errorf("ProcessMediaRedirectDomainOption(%q) = (%q, %v), want (%q, nil)", in, got, err, in)
		}
	}
}

// Node: dev-environment-cli.ts:963-977.
func TestProcessStringOrBooleanOption(t *testing.T) {
	cases := []struct {
		in       string
		wantVal  string
		wantBool bool
		wantKind Kind
	}{
		{"", "", false, KindBool},
		{"false", "", false, KindBool},
		{"n", "", false, KindBool},
		{"0", "", false, KindBool},
		{"true", "", true, KindBool},
		{"y", "", true, KindBool},
		{"1", "", true, KindBool},
		{"subdirectory", "subdirectory", false, KindString},
	}
	for _, c := range cases {
		got := ProcessStringOrBooleanOption(c.in)
		if got.Kind != c.wantKind || got.Bool != c.wantBool || got.String != c.wantVal {
			t.Errorf("ProcessStringOrBooleanOption(%q) = %+v, want kind=%v bool=%v string=%q",
				c.in, got, c.wantKind, c.wantBool, c.wantVal)
		}
	}
}

// Node: dev-environment-cli.ts:979-982 — coerce to string, then toLowerCase.
func TestProcessSlug(t *testing.T) {
	cases := map[string]string{
		"Example-Site": "example-site",
		"MYSITE":       "mysite",
		"already":      "already",
		"":             "",
		"Mixed_Case-1": "mixed_case-1",
	}
	for in, want := range cases {
		if got := ProcessSlug(in); got != want {
			t.Errorf("ProcessSlug(%q) = %q, want %q", in, got, want)
		}
	}
}

// Node: dev-environment-cli.ts:229-255.
func TestProcessComponentOptionInput(t *testing.T) {
	cases := []struct {
		param      string
		allowLocal bool
		wantMode   string
		wantDir    string
		wantTag    string
	}{
		// allowLocal + a path separator => local.
		{"/Users/x/repo", true, "local", "/Users/x/repo", ""},
		{`C:\repo`, true, "local", `C:\repo`, ""},
		{"./repo", true, "local", "./repo", ""},
		// No separator => image, tag = param.
		{"6.4", true, "image", "", "6.4"},
		{"latest", false, "image", "", "latest"},
		// "demo"/"image" => image with NO tag (Node returns undefined).
		{"demo", true, "image", "", ""},
		{"image", true, "image", "", ""},
		// allowLocal=false never yields local, even with a separator.
		{"/Users/x/repo", false, "image", "", "/Users/x/repo"},
	}
	for _, c := range cases {
		got := ProcessComponentOptionInput(c.param, c.allowLocal)
		if got.Mode != c.wantMode || got.Dir != c.wantDir || got.Tag != c.wantTag {
			t.Errorf("ProcessComponentOptionInput(%q, %v) = %+v, want mode=%s dir=%q tag=%q",
				c.param, c.allowLocal, got, c.wantMode, c.wantDir, c.wantTag)
		}
	}
}
