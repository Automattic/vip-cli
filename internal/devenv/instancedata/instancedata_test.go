package instancedata

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/paths"
)

func TestMigratedFromLandoRoundTrips(t *testing.T) {
	in := []byte(`{"siteSlug":"foo","wpTitle":"Foo","multisite":false,"php":"8.2","migratedFromLando":"2026-07-10T00:00:00Z"}`)
	d, err := parse(in)
	if err != nil {
		t.Fatal(err)
	}
	if d.MigratedFromLando != "2026-07-10T00:00:00Z" {
		t.Fatalf("want marker parsed, got %q", d.MigratedFromLando)
	}
	out, err := serialize(d)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"migratedFromLando": "2026-07-10T00:00:00Z"`) {
		t.Fatalf("marker not serialized: %s", out)
	}
}

func TestWriteThenReadRoundTrips(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	in := &InstanceData{
		SiteSlug:  "rt",
		WPTitle:   "Round Trip",
		Multisite: json.RawMessage("false"),
		WordPress: WordPressConfig{Mode: "image", Tag: "trunk"},
		MuPlugins: ComponentConfig{Mode: "image"},
		AppCode:   ComponentConfig{Mode: "local", Dir: "/srv/rt"},
		PHP:       "php:8.2",
		Extra:     map[string]json.RawMessage{"keepMe": json.RawMessage(`"yes"`)},
	}
	if err := Write("rt", in); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if !Exists("rt") {
		t.Fatalf("Exists(rt) = false after Write")
	}

	out, err := Read("rt")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if out.SiteSlug != "rt" || out.WPTitle != "Round Trip" {
		t.Fatalf("round-trip mismatch: %+v", out)
	}
	if string(out.Extra["keepMe"]) != `"yes"` {
		t.Fatalf("Extra not preserved: %q", out.Extra["keepMe"])
	}
}

func TestReadMissingFileReturnsError(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	_, err := Read("nope")
	if err == nil {
		t.Fatal("expected error reading missing env")
	}
}

func TestExistsFalseForMissing(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	if Exists("ghost") {
		t.Fatal("Exists(ghost) = true for missing env")
	}
}

func TestParseSerializePreservesUnknownKeys(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "unknown_keys.json"))
	if err != nil {
		t.Fatal(err)
	}

	d, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if d.SiteSlug != "example" || d.WPTitle != "Example Dev" {
		t.Fatalf("known fields not parsed: %+v", d)
	}
	if !d.PHPMyAdmin {
		t.Fatalf("phpmyadmin should be true")
	}
	if _, ok := d.Extra["futureKeyWeDoNotModel"]; !ok {
		t.Fatalf("unknown key futureKeyWeDoNotModel not captured in Extra")
	}

	out, err := serialize(d)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("re-parse: %v", err)
	}
	if _, ok := got["futureKeyWeDoNotModel"]; !ok {
		t.Fatalf("unknown key lost on serialize")
	}
	if got["anotherUnknown"] != "keep-me" {
		t.Fatalf("unknown scalar lost: %v", got["anotherUnknown"])
	}
	if got["siteSlug"] != "example" {
		t.Fatalf("known key lost: %v", got["siteSlug"])
	}
}

func TestParseAppliesBackcompatMigrations(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "legacy_keys.json"))
	if err != nil {
		t.Fatal(err)
	}
	d, err := parse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if string(d.Elasticsearch) != "true" {
		t.Fatalf("enterpriseSearchEnabled should migrate to elasticsearch=true, got %q", d.Elasticsearch)
	}
	if d.AppCode.Mode != "local" || d.AppCode.Dir != "/srv/legacy" {
		t.Fatalf("clientCode should migrate to appCode, got %+v", d.AppCode)
	}
}

// TestParseMigratesElasticsearchEnabledAlias covers the second legacy
// elasticsearch alias (elasticsearchEnabled), which the fixture-based test
// above does not exercise. applyBackcompat treats both enterpriseSearchEnabled
// and elasticsearchEnabled as inputs (dev-environment-core.ts:565-568).
func TestParseMigratesElasticsearchEnabledAlias(t *testing.T) {
	in := []byte(`{
		"siteSlug": "es",
		"wpTitle": "ES",
		"multisite": false,
		"wordpress": { "mode": "image", "tag": "trunk" },
		"muPlugins": { "mode": "image" },
		"appCode": { "mode": "image" },
		"mediaRedirectDomain": "",
		"phpmyadmin": false,
		"xdebug": false,
		"php": "php:8.2",
		"mailpit": false,
		"photon": false,
		"cron": false,
		"elasticsearchEnabled": true
	}`)
	d, err := parse(in)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if string(d.Elasticsearch) != "true" {
		t.Fatalf("elasticsearchEnabled should migrate to elasticsearch=true, got %q", d.Elasticsearch)
	}
}

// TestKnownKeysMatchStructTags machine-verifies the invariant that every
// modeled struct json tag is listed in knownKeys (and vice versa). If a
// field is added to InstanceData but not to knownKeys, parse() would put
// its key into Extra AND serialize() would also write it from the struct,
// double-writing the key — silent corruption. This test catches that drift.
func TestKnownKeysMatchStructTags(t *testing.T) {
	rt := reflect.TypeOf(InstanceData{})

	tagNames := map[string]bool{}
	for i := 0; i < rt.NumField(); i++ {
		tag := rt.Field(i).Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name == "" {
			continue
		}
		tagNames[name] = true
		if !knownKeys[name] {
			t.Errorf("struct field %s has json key %q missing from knownKeys (would be double-written on round-trip)", rt.Field(i).Name, name)
		}
	}

	for k := range knownKeys {
		if !tagNames[k] {
			t.Errorf("knownKeys has %q with no corresponding struct json tag", k)
		}
	}
}

func TestDomainAndExternalVolumesRoundTrip(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	in := &InstanceData{
		SiteSlug:        "example",
		Multisite:       json.RawMessage("false"),
		Domain:          "mysite.test",
		ExternalVolumes: map[string]string{"database_data": "landoproj_database_data"},
	}
	if err := Write("example", in); err != nil {
		t.Fatal(err)
	}
	got, err := Read("example")
	if err != nil {
		t.Fatal(err)
	}
	if got.Domain != "mysite.test" {
		t.Fatalf("domain lost: %q", got.Domain)
	}
	if got.ExternalVolumes["database_data"] != "landoproj_database_data" {
		t.Fatalf("external volumes lost: %+v", got.ExternalVolumes)
	}
}

func TestEnvVarsRoundTrip(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	d := &InstanceData{
		SiteSlug:  "evs",
		Multisite: json.RawMessage("false"),
		EnvVars:   map[string]string{"MY_VAR": "hello", "OTHER": "x"},
	}
	if err := Write("evs", d); err != nil {
		t.Fatal(err)
	}
	got, err := Read("evs")
	if err != nil {
		t.Fatal(err)
	}
	if got.EnvVars["MY_VAR"] != "hello" || got.EnvVars["OTHER"] != "x" {
		t.Fatalf("EnvVars did not round-trip: %+v", got.EnvVars)
	}
}

func TestEmptyDomainBackfilledToLegacy(t *testing.T) {
	d := &InstanceData{} // Domain == ""
	applyBackcompat(d)
	if d.Domain != LegacyDomain {
		t.Fatalf("empty Domain = %q, want LegacyDomain %q", d.Domain, LegacyDomain)
	}
	d2 := &InstanceData{Domain: "vipdev.site"}
	applyBackcompat(d2)
	if d2.Domain != "vipdev.site" {
		t.Fatalf("non-empty Domain must be left alone, got %q", d2.Domain)
	}
}

func TestAllNamesListsEnvironmentDirectories(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir())

	// No base dir yet -> empty, no error.
	if names := AllNames(); len(names) != 0 {
		t.Fatalf("expected no envs, got %v", names)
	}

	for _, slug := range []string{"alpha", "beta"} {
		if err := Write(slug, &InstanceData{SiteSlug: slug, Multisite: json.RawMessage("false")}); err != nil {
			t.Fatal(err)
		}
	}
	// A stray file (not a directory) must be ignored.
	if err := os.WriteFile(filepath.Join(paths.DevEnvBase(), "stray.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := AllNames()
	want := map[string]bool{"alpha": true, "beta": true}
	if len(got) != 2 {
		t.Fatalf("AllNames() = %v, want alpha+beta only", got)
	}
	for _, n := range got {
		if !want[n] {
			t.Fatalf("unexpected env name %q in %v", n, got)
		}
	}
}
