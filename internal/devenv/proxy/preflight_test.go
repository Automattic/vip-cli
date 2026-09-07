package proxy

import (
	"testing"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

func TestPreflightReturnsNoFindingsForDocker(t *testing.T) {
	findings := Preflight(dockercli.EngineInfo{Engine: dockercli.EngineDocker}, PreflightProbes{UnprivilegedPortStart: 1024})
	if len(findings) != 0 {
		t.Fatalf("got %v, want zero findings for docker regardless of probes", findings)
	}
}

func TestPreflightSurfacesSysctlRemedyForPodmanRootless(t *testing.T) {
	findings := Preflight(dockercli.EngineInfo{Engine: dockercli.EnginePodman}, PreflightProbes{UnprivilegedPortStart: 1024, RunsInsideMachine: false})
	if len(findings) != 1 {
		t.Fatalf("got %d findings, want exactly 1", len(findings))
	}
	if findings[0].Remedy == "" {
		t.Fatal("finding must carry a printable remedy, never mutate the host itself")
	}
	if got := findings[0].Remedy; got != "sudo sysctl net.ipv4.ip_unprivileged_port_start=80 (persist via /etc/sysctl.d/99-podman-rootless-ports.conf)" {
		t.Fatalf("unexpected remedy: %q", got)
	}
}

func TestPreflightSurfacesMachineSSHRemedyWhenInsideMachine(t *testing.T) {
	findings := Preflight(dockercli.EngineInfo{Engine: dockercli.EnginePodman}, PreflightProbes{UnprivilegedPortStart: 1024, RunsInsideMachine: true})
	if len(findings) != 1 {
		t.Fatalf("got %d findings, want exactly 1", len(findings))
	}
	if got := findings[0].Remedy; got != "podman machine ssh -- sudo sysctl net.ipv4.ip_unprivileged_port_start=80" {
		t.Fatalf("unexpected remedy: %q", got)
	}
}

func TestPreflightIsCleanWhenSysctlAlreadyAllowsPort80(t *testing.T) {
	findings := Preflight(dockercli.EngineInfo{Engine: dockercli.EnginePodman}, PreflightProbes{UnprivilegedPortStart: 80})
	if len(findings) != 0 {
		t.Fatalf("got %v, want zero findings when the sysctl already permits port 80", findings)
	}
}
