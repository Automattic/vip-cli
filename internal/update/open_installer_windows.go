package update

import (
	"context"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func openNativeInstaller(ctx context.Context, path string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	system, err := windows.GetSystemDirectory()
	if err != nil {
		return err
	}
	// Full UI lets Windows Installer request elevation and report cancellation or
	// errors. Leave it running after this CLI exits so it can replace the CLI too.
	cmd := exec.Command(filepath.Join(system, "msiexec.exe"), "/i", path, "/norestart")
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
