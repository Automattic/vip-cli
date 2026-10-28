//go:build !darwin && !windows

package update

import (
	"context"
	"fmt"
)

func openNativeInstaller(context.Context, string) error {
	return fmt.Errorf("native installers are only supported on macOS and Windows")
}
