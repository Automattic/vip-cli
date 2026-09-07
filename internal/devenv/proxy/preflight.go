package proxy

import (
	"fmt"

	"github.com/Automattic/vip/internal/devenv/dockercli"
)

const unprivilegedPortStartSysctl = "net.ipv4.ip_unprivileged_port_start"

type PreflightProbes struct {
	UnprivilegedPortStart int
	RunsInsideMachine     bool
}

type PreflightFinding struct {
	Message string
	Remedy  string
}

func unprivilegedPortRemedy(runsInsideMachine bool) string {
	if runsInsideMachine {
		return fmt.Sprintf("podman machine ssh -- sudo sysctl %s=80", unprivilegedPortStartSysctl)
	}
	return fmt.Sprintf("sudo sysctl %s=80 (persist via /etc/sysctl.d/99-podman-rootless-ports.conf)", unprivilegedPortStartSysctl)
}

func Preflight(info dockercli.EngineInfo, probes PreflightProbes) []PreflightFinding {
	if info.Engine != dockercli.EnginePodman {
		return nil
	}
	var findings []PreflightFinding
	if probes.UnprivilegedPortStart > DefaultHTTP {
		findings = append(findings, PreflightFinding{
			Message: fmt.Sprintf("podman rootless cannot bind port %d: %s is %d", DefaultHTTP, unprivilegedPortStartSysctl, probes.UnprivilegedPortStart),
			Remedy:  unprivilegedPortRemedy(probes.RunsInsideMachine),
		})
	}
	return findings
}
