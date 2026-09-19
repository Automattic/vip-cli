//go:build devenv_e2e

// Package devenv e2e harness — the Plan 4 lifecycle integration gate (Task 15).
//
// Build-tagged (devenv_e2e) so it never runs in CI or a normal `go test`. It
// drives the REAL devenv public API against a live Docker daemon and performs
// the host-privileged trust + /etc/hosts step (one sudo prompt). Run on a macOS
// machine with Docker, from a terminal (sudo needs a TTY):
//
//	go test -tags devenv_e2e -run TestDevEnvLifecycleE2E -v \
//	    -timeout 10m ./internal/devenv/
//
// It exercises create (no start) -> Start (one sudo prompt: trust CA +
// /etc/hosts) -> Stop -> re-Start (idempotency) -> Destroy (cleanup). A
// migration sub-scenario is added once the greenfield path passes (pre-seed a
// "<prefix>_database_data" volume and confirm the external mapping + data
// survival).
package devenv

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/e2esafety"
	"github.com/Automattic/vip/internal/devenv/hostops"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/paths"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

const (
	lifecycleProxyContainer = "proxy-container"
	lifecycleProxyNetwork   = "proxy-network"
	lifecycleCertsVolume    = "certs-volume"
	lifecycleConfigVolume   = "config-volume"
	lifecycleTrustedCA      = "trusted-ca"
	lifecycleManagedHosts   = "managed-hosts"
	lifecycleCAHostFile     = "ca-host-file"
	lifecyclePortsState     = "ports-state-file"

	lifecycleBeginMarker = "# BEGIN vip-dev-env"
	lifecycleEndMarker   = "# END vip-dev-env"
)

func TestDevEnvLifecycleE2E(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skipf("e2e is macOS-only; GOOS=%s", runtime.GOOS)
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not found")
	}
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	ctx := context.Background()
	slug := uniqueLifecycleE2ESlug("e2eexample")

	before := captureLifecycleSharedSnapshot(t, ctx)
	if err := before.RequireClean(); err != nil {
		t.Fatal(err)
	}
	owned := e2esafety.Snapshot{}
	t.Cleanup(func() { cleanupLifecycleE2E(t, ctx, slug, owned) })

	// create (no start) then start
	if err := Create(ctx, CreateConfig{Slug: slug, Title: "E2E", PHP: "8.3", WordPress: "trunk"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if !instancedata.Exists(slug) {
		t.Fatal("instance-data not written")
	}
	t.Log(">>> sudo will prompt once (trust CA + /etc/hosts) <<<")
	if err := Start(ctx, slug, StartOptions{}); err != nil {
		t.Fatalf("Start: %v", err)
	}
	recordLifecycleOwned(t, owned, captureLifecycleSharedSnapshot(t, ctx))

	// Stop then re-Start (idempotency)
	if err := Stop(ctx, slug); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if err := Start(ctx, slug, StartOptions{}); err != nil {
		t.Fatalf("re-Start: %v", err)
	}
}

// TestMultisiteSyncLocalE2E exercises the complete local sync path with fixture
// SQL and fixture SDS data. It never constructs a platform API client or sends
// export/sync payloads outside this process.
func TestMultisiteSyncLocalE2E(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skipf("e2e is macOS-only; GOOS=%s", runtime.GOOS)
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not found")
	}
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	binaryName := "go-search-replace-test-darwin-arm64"
	if runtime.GOARCH == "amd64" {
		binaryName = "go-search-replace-test-darwin-x64"
	}
	searchReplaceBin, err := filepath.Abs(filepath.Join("..", "..", "__fixtures__", "search-replace-binaries", binaryName))
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("VIP_SEARCH_REPLACE_BIN", searchReplaceBin)

	ctx := context.Background()
	slug := uniqueLifecycleE2ESlug("e2emultisite")
	before := captureLifecycleSharedSnapshot(t, ctx)
	if err := before.RequireClean(); err != nil {
		t.Fatal(err)
	}
	owned := e2esafety.Snapshot{}
	t.Cleanup(func() { cleanupLifecycleE2E(t, ctx, slug, owned) })

	if err := Create(ctx, CreateConfig{
		Slug: slug, Title: "E2E Multisite", PHP: "8.3", WordPress: "trunk", MultisiteMode: "subdomain",
	}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	t.Log(">>> sudo may prompt for local CA and managed hosts setup <<<")
	if err := Start(ctx, slug, StartOptions{}); err != nil {
		t.Fatalf("Start: %v", err)
	}
	recordLifecycleOwned(t, owned, captureLifecycleSharedSnapshot(t, ctx))

	fixtureSQL := `
-- ('home','https://primary.example.com',
-- ('home','https://sub.primary.example.com',
-- ('home','https://deep.sub.primary.example.com',
-- ('home','https://mapped.example.net',
UPDATE wordpress.wp_options SET option_value = 'https://primary.example.com' WHERE option_name IN ('home', 'siteurl');
DELETE FROM wordpress.wp_blogs WHERE blog_id IN (2, 7, 9);
INSERT INTO wordpress.wp_blogs
    (blog_id, site_id, domain, path, registered, last_updated, public, archived, mature, spam, deleted, lang_id)
VALUES
    (2, 1, 'sub.primary.example.com', '/', '2026-07-14 00:00:00', '2026-07-14 00:00:00', 1, 0, 0, 0, 0, 0),
    (7, 1, 'deep.sub.primary.example.com', '/', '2026-07-14 00:00:00', '2026-07-14 00:00:00', 1, 0, 0, 0, 0, 0),
    (9, 1, 'mapped.example.net', '/', '2026-07-14 00:00:00', '2026-07-14 00:00:00', 1, 0, 0, 0, 0, 0);
`
	sites := []SyncSite{
		{BlogID: 1, HomeURL: "https://primary.example.com", SiteURL: "https://primary.example.com"},
		{BlogID: 2, HomeURL: "https://sub.primary.example.com", SiteURL: "https://sub.primary.example.com"},
		{BlogID: 7, HomeURL: "https://deep.sub.primary.example.com", SiteURL: "https://deep.sub.primary.example.com"},
		{BlogID: 9, HomeURL: "https://mapped.example.net", SiteURL: "https://mapped.example.net"},
	}
	if err := syncSQLWith(ctx, SyncOptions{
		Slug: slug, Domain: compose.DefaultDomain, IsMultisite: true,
	}, SyncDeps{
		ExportTo: func(_ context.Context, dest string) error {
			return os.WriteFile(dest, []byte(fixtureSQL), 0o600)
		},
		FetchSites: func(context.Context) ([]SyncSite, string) { return sites, "" },
		ResolveDraft: func(draft PlanDraft) ([]string, error) {
			return nil, fmt.Errorf("unexpected unresolved mappings: %#v", draft.Unresolved)
		},
		ImportFile: func(ctx context.Context, slug, file string, pairs []string) error {
			return ImportSQL(ctx, slug, file, ImportOptions{
				SearchReplace: pairs, InPlace: true, SkipValidate: true, Quiet: true,
			})
		},
		RepairDomains: RepairBlogDomains,
		RefreshHosts:  RefreshManagedHosts,
		Log:           func(line string) { t.Log(line) },
	}); err != nil {
		t.Fatalf("syncSQLWith: %v", err)
	}
	recordLifecycleOwned(t, owned, captureLifecycleSharedSnapshot(t, ctx))

	runner := &dockercli.Runner{}
	home, err := runner.ComposeOut(ctx, slug,
		"exec", "-T", "php", "wp", "--allow-root", "option", "get", "home")
	if err != nil {
		t.Fatalf("read home: %v", err)
	}
	baseHost := slug + "." + compose.DefaultDomain
	if got := strings.TrimSpace(string(home)); got != "https://"+baseHost {
		t.Fatalf("home = %q, want https://%s", got, baseHost)
	}
	domains, err := runner.ComposeOut(ctx, slug,
		"exec", "-T", "php", "wp", "--allow-root", "db", "query",
		"SELECT blog_id, domain FROM wordpress.wp_blogs ORDER BY blog_id", "--skip-column-names")
	if err != nil {
		t.Fatalf("read wp_blogs: %v", err)
	}
	wantDomains := []string{
		"sub." + baseHost,
		"deep-sub-b7." + baseHost,
		"mapped-example-net-b9." + baseHost,
	}
	for _, domain := range wantDomains {
		if !strings.Contains(string(domains), domain) {
			t.Errorf("wp_blogs output missing %q:\n%s", domain, domains)
		}
	}
	if !hostops.HostsPresent(append([]string{baseHost}, wantDomains...)) {
		t.Fatalf("managed hosts block does not contain base and subsite targets")
	}
}

func TestDevEnvLandoAdoptionE2E(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skipf("e2e is macOS-only; GOOS=%s", runtime.GOOS)
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not found")
	}
	t.Setenv("XDG_DATA_HOME", t.TempDir())
	ctx := context.Background()
	slug := uniqueLifecycleE2ESlug("e2elando")
	fake := slug + "-fake-lando"

	before := captureLifecycleSharedSnapshot(t, ctx)
	if err := before.RequireClean(); err != nil {
		t.Fatal(err)
	}
	r := &dockercli.Runner{}
	if identity := lifecycleDockerObjectIdentity(t, ctx, r, "container", fake, "{{.Id}}"); identity != "" {
		t.Fatalf("devenv_e2e refuses to replace existing test container %s", fake)
	}
	owned := e2esafety.Snapshot{}
	t.Cleanup(func() { cleanupLifecycleE2E(t, ctx, slug, owned) })

	// 1. Greenfield create+start to get a real database_data volume with data.
	if err := Create(ctx, CreateConfig{Slug: slug, Title: "E2E Lando", PHP: "8.3", WordPress: "trunk"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	t.Log(">>> sudo will prompt once (trust CA + /etc/hosts) <<<")
	if err := Start(ctx, slug, StartOptions{}); err != nil {
		t.Fatalf("Start: %v", err)
	}
	recordLifecycleOwned(t, owned, captureLifecycleSharedSnapshot(t, ctx))

	// Seed a marker row we can check survives adoption.
	const marker = "vip-adoption-marker"
	seed := exec.Command("docker", "compose", "-p", slug, "exec", "-T", "database",
		"mysql", "-uwordpress", "-pwordpress", "wordpress", "-e",
		"CREATE TABLE IF NOT EXISTS adopt_check (v VARCHAR(64)); INSERT INTO adopt_check VALUES ('"+marker+"');")
	seed.Dir = paths.EnvironmentPath(slug)
	if out, err := seed.CombinedOutput(); err != nil {
		t.Fatalf("seed marker: %v: %s", err, out)
	}

	// 2. Simulate a leftover Lando footprint: stop the Go containers, then create a
	//    container carrying Lando's labels + this project label bound to the SAME volume.
	if err := Stop(ctx, slug); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	run := exec.Command("docker", "run", "-d", "--name", fake,
		"--label", "com.docker.compose.project="+slug,
		"--label", "io.lando.container=TRUE",
		"-v", slug+"_database_data:/var/lib/mysql",
		"busybox", "sleep", "3600")
	if out, err := run.CombinedOutput(); err != nil {
		t.Fatalf("seed fake Lando container: %v: %s", err, out)
	}

	// 3. Detect + adopt via Start.
	plan, err := PlanLandoMigration(ctx, slug)
	if err != nil {
		t.Fatalf("PlanLandoMigration: %v", err)
	}
	if !plan.Detected {
		t.Fatal("expected a Lando footprint to be detected")
	}
	if err := Start(ctx, slug, StartOptions{Lando: &plan}); err != nil {
		t.Fatalf("adopting Start: %v", err)
	}

	// 4a. The fake Lando container is gone.
	if err := exec.Command("docker", "inspect", fake).Run(); err == nil {
		t.Fatal("fake Lando container should have been removed by adoption")
	}
	// 4b. The marker row survived (same volume reused, never -v'd).
	read := exec.Command("docker", "compose", "-p", slug, "exec", "-T", "database",
		"mysql", "-uwordpress", "-pwordpress", "wordpress", "-N", "-e", "SELECT v FROM adopt_check;")
	read.Dir = paths.EnvironmentPath(slug)
	out, err := read.CombinedOutput()
	if err != nil {
		t.Fatalf("read marker: %v: %s", err, out)
	}
	if !strings.Contains(string(out), marker) {
		t.Fatalf("marker row did not survive adoption; got %q", out)
	}
	// 4c. The instance_data marker is stamped.
	d, err := instancedata.Read(slug)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if d.MigratedFromLando == "" {
		t.Fatal("expected migratedFromLando marker to be stamped")
	}
}

func uniqueLifecycleE2ESlug(prefix string) string {
	return fmt.Sprintf("%s-%d-%d", prefix, os.Getpid(), time.Now().UnixNano())
}

func captureLifecycleSharedSnapshot(t *testing.T, ctx context.Context) e2esafety.Snapshot {
	t.Helper()
	r := &dockercli.Runner{}
	return e2esafety.Snapshot{
		lifecycleProxyContainer: lifecycleDockerObjectIdentity(t, ctx, r, "container", proxy.ProxyContainerName, "{{.Id}}"),
		lifecycleProxyNetwork:   lifecycleDockerObjectIdentity(t, ctx, r, "network", compose.ProxyNetwork, "{{.Id}}"),
		lifecycleCertsVolume:    lifecycleDockerObjectIdentity(t, ctx, r, "volume", proxy.ProxyCertsVolume, "{{.Name}}|{{.CreatedAt}}"),
		lifecycleConfigVolume:   lifecycleDockerObjectIdentity(t, ctx, r, "volume", proxy.ProxyConfigVolume, "{{.Name}}|{{.CreatedAt}}"),
		lifecycleTrustedCA:      lifecycleTrustedCAIdentity(t),
		lifecycleManagedHosts:   lifecycleManagedHostsIdentity(t, "/etc/hosts"),
		lifecycleCAHostFile:     lifecycleFileIdentity(t, proxy.CAHostPath()),
		lifecyclePortsState:     lifecycleFileIdentity(t, proxy.PortsStatePath()),
	}
}

func lifecycleDockerObjectIdentity(t *testing.T, ctx context.Context, r *dockercli.Runner, kind, name, format string) string {
	t.Helper()
	out, err := r.DockerOut(ctx, kind, "inspect", "--format", format, name)
	if err == nil {
		identity := strings.TrimSpace(string(out))
		if identity == "" {
			t.Fatalf("docker %s inspect returned an empty identity for %q", kind, name)
		}
		return identity
	}

	listFormat := "{{.Name}}"
	var listed []byte
	var listErr error
	if kind == "container" {
		listFormat = "{{.Names}}"
		listed, listErr = r.DockerOut(ctx, kind, "ls", "--all", "--filter", "name="+name, "--format", listFormat)
	} else {
		listed, listErr = r.DockerOut(ctx, kind, "ls", "--filter", "name="+name, "--format", listFormat)
	}
	if listErr != nil {
		t.Fatalf("docker %s lookup for %q failed after inspect error: %v", kind, name, listErr)
	}
	for _, candidate := range strings.Split(strings.TrimSpace(string(listed)), "\n") {
		if candidate == name {
			t.Fatalf("docker %s %q exists but its identity could not be inspected: %v", kind, name, err)
		}
	}
	return ""
}

func lifecycleTrustedCAIdentity(t *testing.T) string {
	t.Helper()
	out, err := exec.Command("security", "find-certificate", "-a", "-c", "WPVIP Local CA", "-p",
		"/Library/Keychains/System.keychain").CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "could not be found") {
			return ""
		}
		t.Fatalf("read trusted WPVIP Local CA: %v: %s", err, strings.TrimSpace(string(out)))
	}
	block, rest := pem.Decode(out)
	if block == nil {
		t.Fatal("trusted WPVIP Local CA is not valid PEM")
	}
	if len(strings.TrimSpace(string(rest))) != 0 {
		t.Fatal("multiple WPVIP Local CA certificates found; refusing ambiguous ownership")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse trusted WPVIP Local CA: %v", err)
	}
	return lifecycleHashIdentity(cert.Raw)
}

func lifecycleManagedHostsIdentity(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read hosts file %s: %v", path, err)
	}
	content := string(b)
	if strings.Count(content, lifecycleBeginMarker) != strings.Count(content, lifecycleEndMarker) {
		t.Fatalf("malformed managed hosts block in %s", path)
	}
	if strings.Count(content, lifecycleBeginMarker) > 1 {
		t.Fatalf("multiple managed hosts blocks found in %s; refusing ambiguous ownership", path)
	}
	start := strings.Index(content, lifecycleBeginMarker)
	end := strings.Index(content, lifecycleEndMarker)
	if start < 0 && end < 0 {
		return ""
	}
	if start < 0 || end < start {
		t.Fatalf("malformed managed hosts block in %s", path)
	}
	end += len(lifecycleEndMarker)
	if end < len(content) && content[end] == '\n' {
		end++
	}
	return lifecycleHashIdentity([]byte(content[start:end]))
}

func lifecycleFileIdentity(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return ""
	}
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return lifecycleHashIdentity(b)
}

func lifecycleHashIdentity(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func recordLifecycleOwned(t *testing.T, owned, current e2esafety.Snapshot) {
	t.Helper()
	for name, identity := range current {
		if identity == "" {
			t.Fatalf("created shared resource %s has no identity", name)
		}
		owned[name] = identity
	}
}

func cleanupLifecycleE2E(t *testing.T, ctx context.Context, slug string, owned e2esafety.Snapshot) {
	t.Helper()
	current := captureLifecycleSharedSnapshot(t, ctx)
	if len(owned) == 0 || !e2esafety.AllOwnedMatch(owned, current) {
		t.Log("shared dev-env identity changed; refusing broad Destroy and leaving shared state untouched")
		cmd := exec.Command("docker", "compose", "-p", slug, "down", "--volumes", "--remove-orphans")
		cmd.Dir = paths.EnvironmentPath(slug)
		if err := cmd.Run(); err != nil {
			t.Logf("isolated project cleanup failed: %v", err)
		}
		return
	}
	if err := Destroy(ctx, slug, false); err != nil {
		t.Logf("owned lifecycle teardown failed: %v", err)
		return
	}

	// Destroy intentionally preserves the CA and some shared state in normal use.
	// A tagged test owns a clean-room setup, so remove only identities it created.
	current = captureLifecycleSharedSnapshot(t, ctx)
	r := &dockercli.Runner{}
	removeDocker := func(key string, args ...string) {
		if !e2esafety.CanRemove(owned[key], current[key]) {
			if current[key] != "" {
				t.Logf("%s identity changed; leaving it for manual cleanup", key)
			}
			return
		}
		if err := r.Docker(ctx, args...); err != nil {
			t.Logf("remove owned %s: %v", key, err)
		}
	}
	removeDocker(lifecycleProxyContainer, "rm", "-f", proxy.ProxyContainerName)
	removeDocker(lifecycleConfigVolume, "volume", "rm", proxy.ProxyConfigVolume)
	removeDocker(lifecycleCertsVolume, "volume", "rm", proxy.ProxyCertsVolume)
	removeDocker(lifecycleProxyNetwork, "network", "rm", compose.ProxyNetwork)

	if e2esafety.CanRemove(owned[lifecycleTrustedCA], current[lifecycleTrustedCA]) &&
		e2esafety.CanRemove(owned[lifecycleCAHostFile], current[lifecycleCAHostFile]) {
		cmd := exec.Command("sudo", "security", "remove-trusted-cert", "-d", proxy.CAHostPath())
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			t.Logf("remove owned trusted CA: %v", err)
		}
	} else if current[lifecycleTrustedCA] != "" {
		t.Log("trusted CA or extracted CA identity changed; leaving it for manual cleanup")
	}

	removeFile := func(key, path string) {
		if !e2esafety.CanRemove(owned[key], current[key]) {
			if current[key] != "" {
				t.Logf("%s identity changed; leaving it for manual cleanup", key)
			}
			return
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			t.Logf("remove owned %s: %v", key, err)
		}
	}
	removeFile(lifecycleCAHostFile, proxy.CAHostPath())
	removeFile(lifecyclePortsState, proxy.PortsStatePath())
}
