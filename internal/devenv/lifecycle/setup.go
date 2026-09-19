package lifecycle

import (
	"context"

	"github.com/Automattic/vip/internal/devenv/compose"
)

// setupService is the container the post-start steps run in (the php service).
const setupService = "php"

// setupUser is the non-root service user the `run:` steps execute as. The php
// image's default user is root, so a non-root step must set this explicitly —
// otherwise wp-cli aborts with "running as root" (mirrors Lando running `run:`
// steps as the service user, distinct from `run_as_root:`).
const setupUser = "www-data"

// RunSetupSteps executes the compose SetupSteps in order. run_as_root steps run
// as container root; run steps run as the service user (www-data). Both go
// through `compose exec -T -e TERM=xterm -u <user> php sh -c "<command>"`:
// -T disables TTY allocation, and TERM is set so setup.sh's `tput` calls don't
// warn ("No value for $TERM and no -T specified") on every line.
func RunSetupSteps(ctx context.Context, d Docker, project string, steps []compose.SetupStep) error {
	for _, s := range steps {
		user := setupUser
		if s.AsRoot {
			user = "root"
		}
		args := []string{"exec", "-T", "-e", "TERM=xterm", "-u", user, setupService, "sh", "-c", s.Command}
		if err := d.Compose(ctx, project, args...); err != nil {
			return err
		}
	}
	return nil
}
