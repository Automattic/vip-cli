package softwaresettings

import (
	"reflect"
	"strings"
	"testing"
)

func wpSetting() Software {
	return Software{
		Name: "WordPress", Slug: "wordpress", Pinned: false,
		Current: Version{Version: "6.4"},
		Options: []Version{{Version: "6.3"}, {Version: "6.4"}, {Version: "6.5", Unstable: true}, {Version: "5.9", Deprecated: true}},
	}
}

func TestFormatManagedUpdatesSuffix(t *testing.T) {
	got := FormatSetting(wpSetting(), nil, "table")
	if got.Version != "6.4 (managed updates)" {
		t.Errorf("version = %q", got.Version)
	}
}

func TestFormatAvailableVersionsNonJSONSortedJoined(t *testing.T) {
	got := FormatSetting(wpSetting(), []string{"available_versions"}, "table")
	if got.AvailableVersions != "6.3,6.4,6.5,managed_latest" {
		t.Errorf("available = %q", got.AvailableVersions)
	}
}

func TestFormatAvailableVersionsJSONArray(t *testing.T) {
	got := FormatSettingJSON(wpSetting(), []string{"available_versions"})
	want := []string{"managed_latest", "6.3", "6.4", "6.5"} // managed → supported(option order) → test
	if !reflect.DeepEqual(got.AvailableVersions, want) {
		t.Errorf("available = %v want %v", got.AvailableVersions, want)
	}
}

func TestValidComponentsForAppType(t *testing.T) {
	if got := ValidComponents(2); !reflect.DeepEqual(got, []string{"wordpress", "php", "muplugins"}) {
		t.Errorf("wp components = %v", got)
	}
	if got := ValidComponents(6); !reflect.DeepEqual(got, []string{"wordpress", "php", "muplugins"}) {
		t.Errorf("wp-nonprod components = %v", got)
	}
	if got := ValidComponents(3); !reflect.DeepEqual(got, []string{"nodejs"}) {
		t.Errorf("node components = %v", got)
	}
}

func TestResolveComponentRejectsUnsupported(t *testing.T) {
	_, err := ResolveComponent(2, "nodejs")
	if err == nil || err.Error() != "Component nodejs is not supported. Use one of: wordpress,php,muplugins" {
		t.Errorf("err = %v", err)
	}
}

func TestResolveVersionRejectsUnsupported(t *testing.T) {
	_, err := ResolveVersion(wpSetting(), "wordpress", "9.9")
	if err == nil || !strings.Contains(err.Error(), "Version 9.9 is not supported for WordPress. Use one of:") {
		t.Errorf("err = %v", err)
	}
}

func TestResolveVersionAcceptsAllowed(t *testing.T) {
	v, err := ResolveVersion(wpSetting(), "wordpress", "managed_latest")
	if err != nil || v != "managed_latest" {
		t.Errorf("v=%q err=%v", v, err)
	}
}

// Register 2.9. Node's _processComponentVersion (software.ts:275) validates
// against _optionsForVersion(), whose allOptions array is
// managed → supported → test → DEPRECATED (software.ts:204-209). Deprecated
// versions are therefore selectable for an update. Only the `config software
// get` display path filters them out (software.ts:439). Rejecting them in Go
// blocks the exact rollback a responder reaches for during an incident.
func TestResolveVersionAcceptsDeprecatedVersion(t *testing.T) {
	v, err := ResolveVersion(wpSetting(), "wordpress", "5.9")
	if err != nil {
		t.Fatalf("ResolveVersion(5.9) = %v, want nil — Node permits deprecated versions for update", err)
	}
	if v != "5.9" {
		t.Errorf("v = %q, want 5.9", v)
	}
}

// The "Use one of:" list Node prints is built from the same validValues,
// so it advertises deprecated versions too.
func TestResolveVersionErrorListsDeprecatedVersions(t *testing.T) {
	_, err := ResolveVersion(wpSetting(), "wordpress", "9.9")
	if err == nil {
		t.Fatal("want error for 9.9")
	}
	if !strings.Contains(err.Error(), "5.9") {
		t.Errorf("err = %q, want the deprecated 5.9 listed in the allowed set", err)
	}
}

// Node's option order — managed, supported (option-array order), test,
// deprecated last.
func TestUpdatableVersionsOrderMatchesNodeAllOptions(t *testing.T) {
	got := UpdatableVersions(wpSetting())
	want := []string{"managed_latest", "6.3", "6.4", "6.5", "5.9"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("UpdatableVersions = %v, want %v", got, want)
	}
}

// Guard: broadening the UPDATE surface must not leak deprecated versions
// into `config software get`, which Node explicitly filters (software.ts:439).
func TestDisplayVersionsStillExcludeDeprecated(t *testing.T) {
	got := FormatSettingJSON(wpSetting(), []string{"available_versions"})
	vals, ok := got.AvailableVersions.([]string)
	if !ok {
		t.Fatalf("AvailableVersions type = %T", got.AvailableVersions)
	}
	for _, v := range vals {
		if v == "5.9" {
			t.Errorf("deprecated 5.9 leaked into `config software get` output: %v", vals)
		}
	}
}
