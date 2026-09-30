package compose

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/Automattic/vip/internal/devenv/instancedata"
)

// The same fixtures are exercised against the Node materializer and live nginx
// in internal/parity. This catches dropped instance-data fields and branches
// without requiring Docker in ordinary unit tests.
func TestRenderNginxMediaRouting(t *testing.T) {
	body, err := os.ReadFile("../../../testdata/parity/devenv-nginx.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Modes []struct {
			Name                string
			Photon              bool
			MediaRedirectDomain string
			Contains            []string
		}
	}
	if err := json.Unmarshal(body, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, mode := range fixture.Modes {
		t.Run(mode.Name, func(t *testing.T) {
			data := &instancedata.InstanceData{Photon: mode.Photon, MediaRedirectDomain: mode.MediaRedirectDomain}
			conf := RenderNginxConf(NewView(data, Options{}))
			for _, directive := range mode.Contains {
				if !strings.Contains(conf, directive) {
					t.Errorf("missing media routing directive %q in:\n%s", directive, conf)
				}
			}
			if strings.Contains(conf, "photon:9000") != mode.Photon {
				t.Errorf("Photon route does not match enabled service:\n%s", conf)
			}
			if strings.Contains(conf, "rewrite") != (mode.MediaRedirectDomain != "") {
				t.Errorf("redirect route does not match enabled redirect:\n%s", conf)
			}
			if mode.Name == "disabled" && strings.Contains(conf, "location") {
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
