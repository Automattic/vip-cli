package devenv

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/lifecycle"
)

func TestAnyRunning(t *testing.T) {
	cases := []struct {
		name   string
		states []lifecycle.ServiceState
		want   bool
	}{
		{"none", nil, false},
		{"all-exited", []lifecycle.ServiceState{{Service: "wordpress", State: "exited"}}, false},
		{"one-running", []lifecycle.ServiceState{{Service: "wordpress", State: "exited"}, {Service: "php", State: "running"}}, true},
	}
	for _, c := range cases {
		if got := anyRunning(c.states); got != c.want {
			t.Errorf("%s: anyRunning = %v, want %v", c.name, got, c.want)
		}
	}
}
