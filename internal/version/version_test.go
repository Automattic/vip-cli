package version

import "testing"

func TestStringIncludesVersionAndCommit(t *testing.T) {
	Version = "1.2.3"
	Commit = "abcdef0"

	got := String()
	want := "vip-next 1.2.3 (commit abcdef0)"
	if got != want {
		t.Errorf("String() = %q, want %q", got, want)
	}
}

func TestStringDefaultWhenUnset(t *testing.T) {
	Version = "dev"
	Commit = "unknown"

	got := String()
	want := "vip-next dev (commit unknown)"
	if got != want {
		t.Errorf("String() = %q, want %q", got, want)
	}
}
