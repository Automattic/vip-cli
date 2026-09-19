package dockercli

import (
	"os/exec"
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
