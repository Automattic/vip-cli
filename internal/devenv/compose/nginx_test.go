package compose

import (
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// Catch dropped settings and normalization regressions without Docker.
// internal/parity checks the resulting routes in real nginx.
func TestRenderNginxMediaRouting(t *testing.T) {
	for _, mode := range []struct {
		name, domain, target string
		photon               bool
	}{
		{name: "disabled"},
		{name: "bare-domain", domain: "example.test", target: "https://example.test/$1"},
		{name: "https", domain: "https://example.test", target: "https://example.test/$1"},
		{name: "http-path", domain: "http://example.test/media", target: "http://example.test/media/$1"},
		{name: "photon", photon: true},
		{name: "photon-and-redirect", photon: true, domain: "https://example.test", target: "https://example.test/$1"},
		{name: "trailing-slash", photon: true, domain: "example.test/media/", target: "https://example.test/media//$1"},
	} {
		t.Run(mode.name, func(t *testing.T) {
			data := &instancedata.InstanceData{Photon: mode.photon, MediaRedirectDomain: mode.domain}
			conf := RenderNginxConf(NewView(data, Options{}))
			if mode.target != "" && !strings.Contains(conf, mode.target) {
				t.Errorf("missing redirect target %q in:\n%s", mode.target, conf)
			}
			if strings.Contains(conf, "photon:9000") != mode.photon {
				t.Errorf("Photon route does not match enabled service:\n%s", conf)
			}
			if strings.Contains(conf, "rewrite") != (mode.domain != "") {
				t.Errorf("redirect route does not match enabled redirect:\n%s", conf)
			}
			if mode.name == "disabled" && strings.Contains(conf, "location") {
				t.Errorf("disabled rendering overrides default nginx routes:\n%s", conf)
			}
		})
	}
}

// User input must stay inside one rewrite argument. Keep the EJS escaping and
// nginx capture expansion without letting quotes/newlines add directives.
func TestNginxRedirectTargetEscapesConfigDelimiters(t *testing.T) {
	const domain = "https://example.test/a\";\nreturn 200; #\\'&<>$host"
	const want = `"https://example.test/a&#34;;%0Areturn 200; #\\&#39;&amp;&lt;&gt;$host/$1"`
	if got := nginxRedirectTarget(domain); got != want {
		t.Fatalf("nginx argument = %q, want %q", got, want)
	}
}

func TestNginxRedirectTargetEncodesURLControls(t *testing.T) {
	const domain = "https://example.test/\r\nX-Probe:\tvalue\x00\x7f"
	const want = `"https://example.test/%0D%0AX-Probe:%09value%00%7F/$1"`
	if got := nginxRedirectTarget(domain); got != want {
		t.Fatalf("nginx URL argument = %q, want %q", got, want)
	}
}
