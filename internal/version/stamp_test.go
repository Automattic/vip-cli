package version

import "testing"

func TestStamp(t *testing.T) {
	t.Parallel()

	cases := []struct {
		tag, sha, want string
	}{
		{"5.0.0-beta1", "abc1234", "5.0.0-beta1"},
		{"5.0.0", "abc1234", "5.0.0"},
		{"5.1.0", "abc1234", "5.1.0"},
		{"4.1.1", "abc1234", "5.0.0-dev.abc1234"},
		{"", "abc1234", "5.0.0-dev.abc1234"},
		{"v5.0.0", "abc1234", "5.0.0-dev.abc1234"},
		{"", "", "5.0.0-dev.unknown"},
	}
	for _, tc := range cases {
		got := Stamp(tc.tag, tc.sha)
		if got != tc.want {
			t.Errorf("Stamp(%q, %q) = %q, want %q", tc.tag, tc.sha, got, tc.want)
		}
	}
}
