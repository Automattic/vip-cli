//go:build parity

package parity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/compose"
	"github.com/Automattic/vip/internal/devenv/instancedata"
)

type nginxMode struct {
	Name                string
	Photon              bool
	MediaRedirectDomain string
	RedirectBase        string
}

type nginxRequest struct {
	Path          string
	Exists        bool
	Transform     bool
	Width, Height int
	PhotonStatus  int
}

func nginxFixtures(t *testing.T) ([]nginxMode, []nginxRequest) {
	t.Helper()
	body, err := os.ReadFile("../../testdata/parity/devenv-nginx.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Modes    []nginxMode
		Requests []nginxRequest
	}
	if err := json.Unmarshal(body, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture.Modes, fixture.Requests
}

// Render through both real materializers, including Node's preprocessing and
// Go's InstanceData -> View boundary. No credentials, Docker or Lando startup.
func nginxConfigs(t *testing.T, mode nginxMode) (node, goConf string) {
	t.Helper()
	nodeBin := ResolveNodeVipBin(os.Getenv("NODE_VIP_BIN"), DefaultNodeVipBinProbe())
	if !nodeBin.Ready {
		t.Skip(LoudSkip("dev-env nginx differential", nodeBin.Reason))
	}
	dir := t.TempDir()
	t.Setenv("XDG_DATA_HOME", dir)
	data := &instancedata.InstanceData{
		SiteSlug: "nginx-parity", WPTitle: "Nginx parity", Multisite: json.RawMessage("false"),
		WordPress: instancedata.WordPressConfig{Mode: "image", Tag: "7.1"},
		MuPlugins: instancedata.ComponentConfig{Mode: "image"},
		AppCode:   instancedata.ComponentConfig{Mode: "image"},
		Photon:    mode.Photon, MediaRedirectDomain: mode.MediaRedirectDomain,
	}
	body, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	// createEnvironment only writes isolated files; it does not start services.
	corePath, err := filepath.Abs(filepath.Join(filepath.Dir(nodeBin.Path), "..", "lib", "dev-environment", "dev-environment-core.js"))
	if err != nil {
		t.Fatal(err)
	}
	script := `const core = require(process.argv[1]);
const fs = require('node:fs');
const path = require('node:path');
core.createEnvironment({config: {domain: 'vipdev.site'}}, JSON.parse(process.argv[2]))
  .then(() => process.stdout.write(fs.readFileSync(path.join(core.getEnvironmentPath('nginx-parity'), 'nginx/extra.conf'), 'utf8')))
  .catch(error => { console.error(error); process.exitCode = 1; });`
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "-e", script, corePath, string(body))
	cmd.Dir = root
	cmd.Env = FixtureEnv(map[string]string{"XDG_DATA_HOME": dir})
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Node materializer: %v\n%s", err, out)
	}
	node = string(out)
	// Use another slug so Go cannot overwrite Node's reference files.
	data.SiteSlug = "nginx-go-parity"
	goDir, err := devenv.Materialize(data.SiteSlug, compose.NewView(data, compose.Options{}))
	if err != nil {
		t.Fatal(err)
	}
	out, err = os.ReadFile(filepath.Join(goDir, "nginx", "extra.conf"))
	if err != nil {
		t.Fatal(err)
	}
	return node, string(out)
}

func TestDevEnvNginxRenderingDifferential(t *testing.T) {
	modes, _ := nginxFixtures(t)
	for _, mode := range modes {
		t.Run(mode.Name, func(t *testing.T) {
			node, goConf := nginxConfigs(t, mode)
			// Quotes make the redirect one nginx argument; whitespace and the
			// Go file header have no effect on routing. HTTP tests below verify
			// the runtime semantics, rather than relying on this comparison.
			normalize := func(conf string) string {
				conf = strings.TrimPrefix(conf, "# VIP dev-env extra nginx configuration\n")
				return strings.Join(strings.Fields(strings.ReplaceAll(conf, `"`, "")), " ")
			}
			if normalize(node) != normalize(goConf) {
				t.Fatalf("nginx rendering differs:\nNode:\n%s\nGo:\n%s", node, goConf)
			}
		})
	}
}

// This opt-in fixture starts only owned nginx/Photon containers, with temporary
// copied content. It never runs dev-env lifecycle, touches hosts/certs, uses
// databases, creates networks, or mounts existing environments. Ordinary parity
// tests do not invoke Docker. Run with VIP_DEVENV_NGINX_PARITY=1 and -tags=parity.
func TestDevEnvNginxHTTPDifferential(t *testing.T) {
	if os.Getenv("VIP_DEVENV_NGINX_PARITY") != "1" {
		t.Skip("set VIP_DEVENV_NGINX_PARITY=1 for isolated Docker nginx/Photon HTTP parity")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Fatal("Docker is required for explicitly enabled nginx HTTP parity")
	}
	docker := func(t *testing.T, args ...string) string {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "docker", args...)
		cmd.Env = FixtureEnv(map[string]string{"DOCKER_HOST": os.Getenv("DOCKER_HOST"), "DOCKER_CONTEXT": os.Getenv("DOCKER_CONTEXT")})
		out, err := cmd.CombinedOutput()
		if err != nil {
			if len(args) > 1 && args[0] == "exec" {
				logs := exec.CommandContext(ctx, "docker", "logs", args[1])
				logs.Env = cmd.Env
				if output, logErr := logs.CombinedOutput(); logErr == nil {
					t.Logf("container logs:\n%s", output)
				}
			}
			t.Fatalf("docker %s: %v\n%s", strings.Join(args, " "), err, out)
		}
		return strings.TrimSpace(string(out))
	}
	create := func(t *testing.T, args ...string) string {
		t.Helper()
		id := docker(t, append([]string{"create", "--pull=never"}, args...)...)
		t.Cleanup(func() { docker(t, "rm", "-f", "-v", id) })
		return id
	}
	wp := t.TempDir()
	uploads := filepath.Join(wp, "wp-content", "uploads")
	if err := os.MkdirAll(uploads, 0o755); err != nil {
		t.Fatal(err)
	}
	img := image.NewNRGBA(image.Rect(0, 0, 16, 12))
	for y := range 12 {
		for x := range 16 {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x * 15), G: uint8(y * 20), B: 120, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"existing.png", "existing-upper.PNG"} {
		if err := os.WriteFile(filepath.Join(uploads, name), encoded.Bytes(), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(uploads, "local.txt"), []byte("local upload\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Both nginx instances share only this fixture's network namespace with
	// Photon. This avoids creating a network/address pool or shared DNS aliases.
	photon := create(t, "--publish", "127.0.0.1::80", "--add-host", "photon:127.0.0.1", "--add-host", "php:127.0.0.1",
		"--entrypoint", "/bin/sh", "ghcr.io/automattic/vip-container-images/photon:latest", "-c",
		"mkdir -p /usr/share/webapps/photon/uploads; cp -R /tmp/uploads/. /usr/share/webapps/photon/uploads/; exec /usr/sbin/php-fpm -F")
	docker(t, "cp", uploads, photon+":/tmp/uploads")
	docker(t, "start", photon)
	address := docker(t, "port", photon, "80/tcp")
	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{Proxy: nil},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	type response struct {
		Status        int
		Location      string
		Injected      string
		Width, Height int
		Body          [32]byte
	}
	probe := func(path string) (response, error) {
		r, err := client.Get("http://" + address + path)
		if err != nil {
			return response{}, err
		}
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return response{}, err
		}
		result := response{Status: r.StatusCode, Location: r.Header.Get("Location"), Injected: r.Header.Get("X-Probe"), Body: sha256.Sum256(body)}
		if decoded, err := png.DecodeConfig(bytes.NewReader(body)); err == nil {
			result.Width, result.Height = decoded.Width, decoded.Height
		}
		return result, nil
	}
	serveConfig := func(t *testing.T, conf string) string {
		t.Helper()
		confPath := filepath.Join(t.TempDir(), "extra.conf")
		if err := os.WriteFile(confPath, []byte(conf), 0o644); err != nil {
			t.Fatal(err)
		}
		nginx := create(t, "--network", "container:"+photon, "--entrypoint", "/bin/sh",
			"ghcr.io/automattic/vip-container-images/nginx:latest", "-c",
			`mkdir -p /wp /etc/nginx/conf.extra; cp -R /tmp/wp/. /wp/; cp /tmp/extra.conf /etc/nginx/conf.extra/extra.conf; chmod -R a+rX /wp; exec /usr/sbin/nginx -g 'daemon off;'`)
		docker(t, "cp", wp, nginx+":/tmp/wp")
		docker(t, "cp", confPath, nginx+":/tmp/extra.conf")
		docker(t, "start", nginx)
		// Syntax check uses the real image's base config and include path.
		docker(t, "exec", nginx, "nginx", "-t")
		deadline := time.Now().Add(10 * time.Second)
		for {
			if _, err := probe("/wp-content/uploads/local.txt"); err == nil {
				return nginx
			}
			if time.Now().After(deadline) {
				t.Fatal("nginx did not become ready")
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	modes, requests := nginxFixtures(t)
	for _, mode := range modes {
		t.Run(mode.Name, func(t *testing.T) {
			node, goConf := nginxConfigs(t, mode)
			var baseline []response
			for _, runtime := range []struct{ name, conf string }{{"Node", node}, {"Go", goConf}} {
				nginx := serveConfig(t, runtime.conf)
				for i, request := range requests {
					got, err := probe(request.Path)
					if err != nil {
						t.Fatal(err)
					}
					status := 404
					if request.Exists {
						status = 200
					} else if mode.RedirectBase != "" {
						status = 302
					} else if mode.Photon && request.PhotonStatus != 0 {
						// Photon reports an unavailable source image as 400.
						status = request.PhotonStatus
					}
					if got.Status != status {
						t.Errorf("%s %s: status %d, want %d", runtime.name, request.Path, got.Status, status)
					}
					location := ""
					if status == 302 {
						location = mode.RedirectBase + request.Path
					}
					if got.Location != location {
						t.Errorf("%s %s: redirect %q, want %q", runtime.name, request.Path, got.Location, location)
					}
					if request.Width != 0 {
						width, height := request.Width, request.Height
						if !mode.Photon && request.Transform {
							width, height = 16, 12
						}
						if got.Width != width || got.Height != height {
							t.Errorf("%s %s: image %dx%d, want %dx%d", runtime.name, request.Path, got.Width, got.Height, width, height)
						}
						if (!request.Transform || !mode.Photon) && got.Body != sha256.Sum256(encoded.Bytes()) {
							t.Errorf("%s %s: local PNG contents changed", runtime.name, request.Path)
						}
					}
					if runtime.name == "Node" {
						baseline = append(baseline, got)
					} else if got != baseline[i] {
						t.Errorf("%s response differs: Node %+v, Go %+v", request.Path, baseline[i], got)
					}
					t.Logf("%s %s: %d location=%q image=%dx%d", runtime.name, request.Path, got.Status, got.Location, got.Width, got.Height)
				}
				// Stop just this owned process before the other renderer binds 80.
				docker(t, "stop", nginx)
			}
		})
	}
	t.Run("Go-control-characters", func(t *testing.T) {
		// These are invalid URL bytes, not a Node-supported domain. Ensure
		// quoting cannot turn them into injected HTTP response headers.
		view := compose.NewView(&instancedata.InstanceData{MediaRedirectDomain: "https://example.test/\r\nX-Probe:injected"}, compose.Options{})
		serveConfig(t, compose.RenderNginxConf(view))
		got, err := probe("/wp-content/uploads/missing.png")
		if err != nil {
			t.Fatal(err)
		}
		const want = "https://example.test/%0D%0AX-Probe:injected/wp-content/uploads/missing.png"
		if got.Status != 302 || got.Location != want || got.Injected != "" {
			t.Fatalf("unsafe control-byte redirect: status=%d Location=%q X-Probe=%q", got.Status, got.Location, got.Injected)
		}
	})
}
