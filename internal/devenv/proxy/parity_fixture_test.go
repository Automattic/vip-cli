package proxy

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

type preflightFixtureCase struct {
	Name   string `json:"name"`
	Engine string `json:"engine"`
	Probes struct {
		UnprivilegedPortStart int  `json:"unprivileged_port_start"`
		RunsInsideMachine     bool `json:"runs_inside_machine"`
	} `json:"probes"`
	ExpectedFindings []struct {
		Remedy string `json:"remedy"`
	} `json:"expected_findings"`
}

type preflightFixture struct {
	Cases []preflightFixtureCase `json:"cases"`
}

type proxySpecFixtureCase struct {
	Name       string `json:"name"`
	Engine     string `json:"engine"`
	SocketPath string `json:"socket_path"`
	Expected   struct {
		BindAddress             string `json:"bind_address"`
		SocketMountSource       string `json:"socket_mount_source"`
		SocketMountTarget       string `json:"socket_mount_target"`
		SecurityOptDisableLabel bool   `json:"security_opt_disable_label"`
	} `json:"expected"`
}

type proxySpecFixture struct {
	Cases []proxySpecFixtureCase `json:"cases"`
}

func loadProxyParityFixture(t *testing.T, name string, into any) {
	t.Helper()
	b, err := os.ReadFile("../../../testdata/parity/" + name)
	if err != nil {
		t.Fatalf("read parity fixture %q: %v", name, err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		t.Fatalf("parse parity fixture %q: %v", name, err)
	}
}

func TestParityFixtureDevenvPodmanPreflight(t *testing.T) {
	var fixture preflightFixture
	loadProxyParityFixture(t, "devenv-podman-preflight.json", &fixture)
	for _, c := range fixture.Cases {
		t.Run(c.Name, func(t *testing.T) {
			info := dockercli.EngineInfo{Engine: dockercli.Engine(c.Engine)}
			findings := Preflight(info, PreflightProbes{
				UnprivilegedPortStart: c.Probes.UnprivilegedPortStart,
				RunsInsideMachine:     c.Probes.RunsInsideMachine,
			})
			if len(findings) != len(c.ExpectedFindings) {
				t.Fatalf("got %d findings, want %d: %+v", len(findings), len(c.ExpectedFindings), findings)
			}
			for i, want := range c.ExpectedFindings {
				if findings[i].Remedy != want.Remedy {
					t.Fatalf("finding %d remedy = %q, want %q", i, findings[i].Remedy, want.Remedy)
				}
			}
		})
	}
}

func TestParityFixtureDevenvPodmanProxySpec(t *testing.T) {
	var fixture proxySpecFixture
	loadProxyParityFixture(t, "devenv-podman-proxy-spec.json", &fixture)
	for _, c := range fixture.Cases {
		t.Run(c.Name, func(t *testing.T) {
			info := dockercli.EngineInfo{Engine: dockercli.Engine(c.Engine), SocketPath: c.SocketPath}
			if got := ProxyBindAddressFor(info); got != c.Expected.BindAddress {
				t.Fatalf("ProxyBindAddressFor = %q, want %q", got, c.Expected.BindAddress)
			}
			mount := ProxySocketMountFor(info)
			if mount.Source != c.Expected.SocketMountSource {
				t.Fatalf("socket mount source = %q, want %q", mount.Source, c.Expected.SocketMountSource)
			}
			if mount.Target != c.Expected.SocketMountTarget {
				t.Fatalf("socket mount target = %q, want %q", mount.Target, c.Expected.SocketMountTarget)
			}
			if mount.SecurityOptDisableLabel != c.Expected.SecurityOptDisableLabel {
				t.Fatalf("SecurityOptDisableLabel = %v, want %v", mount.SecurityOptDisableLabel, c.Expected.SecurityOptDisableLabel)
			}
		})
	}
}
