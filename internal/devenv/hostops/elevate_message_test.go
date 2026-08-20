package hostops

import "testing"

func TestPlanActions(t *testing.T) {
	if a := planActions(PrivilegedPlan{}); len(a) != 0 {
		t.Fatalf("empty plan => no actions, got %v", a)
	}
	if a := planActions(PrivilegedPlan{CAPath: "/x/ca.pem", HostsAdd: []string{"a.test"}}); len(a) != 2 {
		t.Fatalf("trust+hosts => 2 actions, got %v", a)
	}
	if a := planActions(PrivilegedPlan{CAPath: "/x/ca.pem"}); len(a) != 1 || a[0] != "trust the local development HTTPS certificate" {
		t.Fatalf("trust-only actions wrong: %v", a)
	}
	if a := planActions(PrivilegedPlan{HostsRemove: true}); len(a) != 1 {
		t.Fatalf("remove => 1 action, got %v", a)
	}
}

func TestJoinAnd(t *testing.T) {
	cases := []struct {
		in   []string
		want string
	}{
		{nil, ""},
		{[]string{"one"}, "one"},
		{[]string{"one", "two"}, "one and two"},
		{[]string{"one", "two", "three"}, "one, two, and three"},
	}
	for _, c := range cases {
		if got := joinAnd(c.in); got != c.want {
			t.Fatalf("joinAnd(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}
