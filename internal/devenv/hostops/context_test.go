package hostops

import "testing"

func TestResolveContext(t *testing.T) {
	cases := []struct {
		goos, procVersion string
		want              ctxKind
	}{
		{"darwin", "", ctxUnix},
		{"linux", "Linux version 6.1.0-generic", ctxUnix},
		{"linux", "Linux version 5.15.90.1-microsoft-standard-WSL2", ctxWindows},
		{"windows", "", ctxWindows},
	}
	for _, c := range cases {
		if got := resolveContext(c.goos, c.procVersion, ""); got != c.want {
			t.Fatalf("resolveContext(%q,%q)=%v want %v", c.goos, c.procVersion, got, c.want)
		}
	}
	// WSL_DISTRO_NAME env is an alternate WSL marker.
	if got := resolveContext("linux", "", "Ubuntu"); got != ctxWindows {
		t.Fatalf("WSL via env not detected: %v", got)
	}
}
