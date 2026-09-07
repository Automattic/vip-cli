package dockercli

import (
	"os/exec"
	"strings"
)

// composeInvocation decides how to invoke Compose: the `docker compose` plugin
// (preferred) or the standalone `docker-compose` binary. look mirrors
// exec.LookPath; pluginOK reports whether `<dockerBin> compose version` works.
func composeInvocation(dockerBin string, look func(string) (string, error), pluginOK func() bool) []string {
	if pluginOK() {
		return []string{dockerBin, "compose"}
	}
	if _, err := look("docker-compose"); err == nil {
		return []string{"docker-compose"}
	}
	return []string{dockerBin, "compose"} // default; exec surfaces the real error
}

// composeInv caches the resolved invocation per runner.
func (r *Runner) composeInv() []string {
	r.composeOnce.Do(func() {
		r.composeCmd = composeInvocation(r.dockerBin(),
			exec.LookPath,
			func() bool {
				return exec.Command(r.dockerBin(), "compose", "version").Run() == nil
			})
	})
	return r.composeCmd
}

type ComposeRequirementResult struct {
	OK     bool
	Reason string
	Remedy string
}

const podmanComposeRequirementRemedy = "install docker-compose v2 (e.g. `brew install docker-compose`, or the docker-compose-plugin package) so `docker-compose version` reports a v2.x release; podman-compose is not supported"

func ComposeRequirement(info EngineInfo, dockerComposeVersion func() (string, error)) ComposeRequirementResult {
	if info.Engine != EnginePodman {
		return ComposeRequirementResult{OK: true}
	}
	version, err := dockerComposeVersion()
	if err == nil && strings.Contains(version, "v2") {
		return ComposeRequirementResult{OK: true}
	}
	return ComposeRequirementResult{
		OK:     false,
		Reason: "podman requires a real docker-compose v2 binary; podman-compose is not supported",
		Remedy: podmanComposeRequirementRemedy,
	}
}

func DockerComposeVersionProbe() (string, error) {
	out, err := exec.Command("docker-compose", "version", "--short").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
