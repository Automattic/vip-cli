package dockercli

import (
	"encoding/json"
	"os"
	"testing"
)

type detectFixtureCase struct {
	Name        string `json:"name"`
	InfoFixture string `json:"info_fixture"`
	Expected    struct {
		Engine        string `json:"engine"`
		ServerVersion string `json:"server_version"`
		ComposePlugin bool   `json:"compose_plugin"`
		Rootless      bool   `json:"rootless"`
	} `json:"expected"`
}

type detectFixture struct {
	Cases []detectFixtureCase `json:"cases"`
}

type composeFixtureCase struct {
	Name                 string  `json:"name"`
	Engine               string  `json:"engine"`
	DockerComposeVersion *string `json:"docker_compose_version"`
	Expected             struct {
		OK     bool   `json:"ok"`
		Reason string `json:"reason"`
	} `json:"expected"`
}

type composeFixture struct {
	Cases []composeFixtureCase `json:"cases"`
}

func loadParityFixture(t *testing.T, name string, into any) {
	t.Helper()
	b, err := os.ReadFile("../../../testdata/parity/" + name)
	if err != nil {
		t.Fatalf("read parity fixture %q: %v", name, err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		t.Fatalf("parse parity fixture %q: %v", name, err)
	}
}

func TestParityFixtureDevenvPodmanDetect(t *testing.T) {
	var fixture detectFixture
	loadParityFixture(t, "devenv-podman-detect.json", &fixture)
	for _, c := range fixture.Cases {
		t.Run(c.Name, func(t *testing.T) {
			raw, err := os.ReadFile("../../../" + c.InfoFixture)
			if err != nil {
				t.Fatalf("read info fixture: %v", err)
			}
			info, err := DetectEngine("docker", "", runnerReturning(raw, nil))
			if err != nil {
				t.Fatalf("DetectEngine: %v", err)
			}
			if string(info.Engine) != c.Expected.Engine {
				t.Fatalf("Engine = %q, want %q", info.Engine, c.Expected.Engine)
			}
			if info.ServerVersion != c.Expected.ServerVersion {
				t.Fatalf("ServerVersion = %q, want %q", info.ServerVersion, c.Expected.ServerVersion)
			}
			if info.ComposePlugin != c.Expected.ComposePlugin {
				t.Fatalf("ComposePlugin = %v, want %v", info.ComposePlugin, c.Expected.ComposePlugin)
			}
			if info.Rootless != c.Expected.Rootless {
				t.Fatalf("Rootless = %v, want %v", info.Rootless, c.Expected.Rootless)
			}
		})
	}
}

func TestParityFixtureDevenvPodmanCompose(t *testing.T) {
	var fixture composeFixture
	loadParityFixture(t, "devenv-podman-compose.json", &fixture)
	for _, c := range fixture.Cases {
		t.Run(c.Name, func(t *testing.T) {
			info := EngineInfo{Engine: Engine(c.Engine)}
			result := ComposeRequirement(info, func() (string, error) {
				if c.DockerComposeVersion == nil {
					return "", os.ErrNotExist
				}
				return *c.DockerComposeVersion, nil
			})
			if result.OK != c.Expected.OK {
				t.Fatalf("OK = %v, want %v", result.OK, c.Expected.OK)
			}
			if c.Expected.Reason != "" && result.Reason != c.Expected.Reason {
				t.Fatalf("Reason = %q, want %q", result.Reason, c.Expected.Reason)
			}
		})
	}
}
