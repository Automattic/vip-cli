package update

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// NativeInstaller hands verified packages to the OS installer, which owns
// privilege elevation, installation, and its receipts.
type NativeInstaller struct {
	Downloader Downloader
	Open       func(context.Context, string) error
}

func (p Platform) installerName() (string, error) {
	ext := ""
	switch p.OS + "/" + p.Arch {
	case "darwin/arm64", "darwin/amd64":
		ext = ".pkg"
	case "windows/amd64":
		ext = ".msi"
	default:
		return "", fmt.Errorf("native installers are unavailable for %s/%s", p.OS, p.Arch)
	}
	return "vip-next-" + p.OS + "-" + p.Arch + ext, nil
}

// Use the exact release selected by the channel policy. Never fall back to an
// older installer or replace an installer-owned bundle with a portable archive.
func nativeInstallerAssets(version string, p Platform, releases []Release) (asset, checksum Asset, err error) {
	name, err := p.installerName()
	if err != nil {
		return asset, checksum, err
	}
	for _, r := range releases {
		if r.Tag != version {
			continue
		}
		for _, a := range r.Assets {
			switch a.Name {
			case name:
				if asset.Name != "" {
					return asset, checksum, fmt.Errorf("release %s has duplicate installer assets", version)
				}
				asset = a
			case name + ".sha256":
				if checksum.Name != "" {
					return asset, checksum, fmt.Errorf("release %s has duplicate installer assets", version)
				}
				checksum = a
			}
		}
	}
	if asset.Name == "" || checksum.Name == "" {
		return asset, checksum, fmt.Errorf("release %s has no complete %s installer download; check %s/tag/%s", version, name, ReleasesURL, version)
	}
	return asset, checksum, validateReleaseAssets(version, name, asset, checksum)
}

func (i NativeInstaller) handoff(ctx context.Context, version string, asset, checksum Asset, cacheDir string, interactive bool, progress func(Step)) (string, error) {
	if !interactive {
		return "Download and run the installer to finish upgrading:\n" + asset.URL, nil
	}
	progress(Step{Name: "Downloading " + version + " installer"})
	data, err := i.Downloader.verifiedDownload(ctx, asset, checksum)
	if err != nil {
		return "", err
	}
	progress(Step{Name: "Downloading " + version + " installer", Done: true})
	progress(Step{Name: "Verifying installer", Done: true})
	if err := os.MkdirAll(cacheDir, 0700); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp(cacheDir, "installer-")
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(dir, asset.Name))
	if err == nil {
		err = os.WriteFile(path, data, 0600)
	}
	if err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	if err := ctx.Err(); err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	opener := i.Open
	if opener == nil {
		opener = openNativeInstaller
	}
	// Keep the verified package after handoff (including a launch failure).
	// Native installers read it asynchronously and may need it until completion.
	if err := opener(ctx, path); err != nil {
		return "", fmt.Errorf("could not open installer: %w\nRun the downloaded installer manually: %s", err, path)
	}
	return "Installer opened. Follow its prompts to finish upgrading.\nAfter installation, run vip-next --version to verify the upgrade.\nDownloaded installer (safe to delete after installation): " + path, nil
}
