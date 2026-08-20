package proxy

import "errors"

// errDocker is a sentinel a fake DockerRunner returns to signal command
// failure in tests; production runners return the real exec error.
var errDocker = errors.New("docker command failed")
