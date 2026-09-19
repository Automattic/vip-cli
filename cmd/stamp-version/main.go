package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/Automattic/vip/internal/version"
)

func main() {
	tag := strings.TrimSpace(os.Getenv("BUILDKITE_TAG"))
	if tag == "" {
		out, err := exec.Command("git", "describe", "--tags", "--exact-match").Output()
		if err == nil {
			tag = strings.TrimSpace(string(out))
		}
	}
	sha := "unknown"
	if out, err := exec.Command("git", "rev-parse", "--short", "HEAD").Output(); err == nil {
		sha = strings.TrimSpace(string(out))
	}
	fmt.Print(version.Stamp(tag, sha))
}
