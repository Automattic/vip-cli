package installer

import "testing"

func TestNumericVersion(t *testing.T) {
	for _, tt := range []struct{ input, want string }{
		{"5.0.0-dev.abc1234", "5.0.0"},
		{"5.0.0-alpha.0", "5.0.100"},
		{"5.0.0-alpha.199", "5.0.299"},
		{"5.0.0-beta.0", "5.0.300"},
		{"5.0.0-beta.199", "5.0.499"},
		{"5.0.0-rc.0", "5.0.500"},
		{"5.0.0-rc.199", "5.0.699"},
		{"5.0.0", "5.0.999"},
		{"5.0.1-alpha.0", "5.0.1100"},
		{"5.12.3-alpha.10", "5.12.3110"},
		{"255.255.64", "255.255.64999"},
	} {
		t.Run(tt.input, func(t *testing.T) {
			got, err := NumericVersion(tt.input)
			if err != nil || got != tt.want {
				t.Fatalf("got %q, %v; want %q", got, err, tt.want)
			}
		})
	}
	for _, input := range []string{"", "v5.0.0", "5.0", "5.0.0-beta1", "5.0.0-beta.200", "5.0.0-alpha.01", "5.0.0-rc.-1", "256.0.0", "5.256.0", "5.0.65", "05.0.0", "5.0.0-unknown.1", "5.0.0-dev.", "5.0.0+meta", "9999999999999999999999.0.0"} {
		t.Run(input, func(t *testing.T) {
			if got, err := NumericVersion(input); err == nil {
				t.Fatalf("accepted %q as %q", input, got)
			}
		})
	}
}
