package update

import (
	"context"
	"os/exec"
)

func openNativeInstaller(ctx context.Context, path string) error {
	// Open the OS installer explicitly, independent of file associations. Do not
	// wait for the GUI to exit or mistake a successful launch for installation.
	return exec.CommandContext(ctx, "/usr/bin/open", "-a", "/System/Library/CoreServices/Installer.app", path).Run()
}
