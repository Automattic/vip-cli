package hostops

import (
	"os"
	"runtime"
	"strings"
)

// ctxKind is the elevation/hosts strategy for the current runtime.
type ctxKind int

const (
	// ctxUnix: macOS / native Linux — edit /etc/hosts via `sudo /bin/sh`.
	ctxUnix ctxKind = iota
	// ctxWindows: native Windows OR Linux-inside-WSL — edit the WINDOWS hosts
	// file + Windows cert store via `powershell.exe Start-Process -Verb RunAs`.
	// WSL targets Windows because the user's browser (on Windows) reads the
	// Windows hosts file; WSL's /etc/hosts is regenerated from it.
	ctxWindows
)

// resolveContext maps (GOOS, /proc/version contents, WSL_DISTRO_NAME) to a ctxKind.
// procVersion/wslDistro are injected for testability.
func resolveContext(goos, procVersion, wslDistro string) ctxKind {
	if goos == "windows" {
		return ctxWindows
	}
	if goos == "linux" && (wslDistro != "" || strings.Contains(strings.ToLower(procVersion), "microsoft")) {
		return ctxWindows
	}
	return ctxUnix
}

// currentContext resolves the live runtime context.
func currentContext() ctxKind {
	pv, _ := os.ReadFile("/proc/version")
	return resolveContext(runtime.GOOS, string(pv), os.Getenv("WSL_DISTRO_NAME"))
}
