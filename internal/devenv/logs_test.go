package devenv

import "testing"

func TestLogsArgs(t *testing.T) {
	cases := []struct {
		name string
		opt  LogOptions
		want []string
	}{
		{"all", LogOptions{}, []string{"logs", "--timestamps"}},
		{"follow", LogOptions{Follow: true}, []string{"logs", "--timestamps", "--follow"}},
		{"service", LogOptions{Service: "database"}, []string{"logs", "--timestamps", "database"}},
		{"follow+service", LogOptions{Follow: true, Service: "php"}, []string{"logs", "--timestamps", "--follow", "php"}},
	}
	for _, c := range cases {
		got := logsArgs(c.opt)
		if len(got) != len(c.want) {
			t.Errorf("%s: logsArgs = %v, want %v", c.name, got, c.want)
			continue
		}
		for i := range c.want {
			if got[i] != c.want[i] {
				t.Errorf("%s: logsArgs[%d] = %q, want %q", c.name, i, got[i], c.want[i])
			}
		}
	}
}
