//go:build parity

package parity

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
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

// Exercise both materializers, including their instance-data preprocessing.
func nginxConfigs(t *testing.T, photon bool, domain string) (string, string) {
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
		Photon:    photon, MediaRedirectDomain: domain,
	}
	body, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
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
	cmd.Env = FixtureEnv(map[string]string{"XDG_DATA_HOME": dir})
	node, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Node materializer: %v\n%s", err, node)
	}
	data.SiteSlug = "nginx-go-parity"
	goDir, err := devenv.Materialize(data.SiteSlug, compose.NewView(data, compose.Options{}))
	if err != nil {
		t.Fatal(err)
	}
	goConf, err := os.ReadFile(filepath.Join(goDir, "nginx", "extra.conf"))
	if err != nil {
		t.Fatal(err)
	}
	return string(node), string(goConf)
}

// Opt-in: only owned nginx/Photon containers and copied temporary files.
// No dev-env lifecycle, hosts/certs, databases, networks, or existing env mounts.
func TestDevEnvNginxHTTPDifferential(t *testing.T) {
	if os.Getenv("VIP_DEVENV_NGINX_PARITY") != "1" {
		t.Skip("set VIP_DEVENV_NGINX_PARITY=1 for isolated Docker nginx/Photon HTTP parity")
	}
	docker := func(t *testing.T, args ...string) string {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "docker", args...)
		cmd.Env = FixtureEnv(map[string]string{"DOCKER_HOST": os.Getenv("DOCKER_HOST"), "DOCKER_CONTEXT": os.Getenv("DOCKER_CONTEXT")})
		out, err := cmd.CombinedOutput()
		if err != nil {
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
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewNRGBA(image.Rect(0, 0, 16, 12))); err != nil {
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
	// Share a private network namespace to avoid allocating a Docker subnet.
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
		status        int
		location      string
		injected      string
		body          string
		width, height int
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
		got := response{status: r.StatusCode, location: r.Header.Get("Location"), injected: r.Header.Get("X-Probe"), body: string(body)}
		if img, err := png.DecodeConfig(bytes.NewReader(body)); err == nil {
			got.width, got.height = img.Width, img.Height
		}
		return got, nil
	}
	serve := func(t *testing.T, conf string) {
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
		docker(t, "exec", nginx, "nginx", "-t")
		deadline := time.Now().Add(10 * time.Second)
		for {
			if _, err := probe("/wp-content/uploads/existing.png"); err == nil {
				return
			}
			if time.Now().After(deadline) {
				t.Fatal("nginx did not become ready")
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	type check struct {
		path, location string
		status, width  int
	}
	for _, mode := range []struct {
		name, domain string
		photon       bool
		checks       []check
	}{
		{"disabled", "", false, []check{{"existing.png", "", 200, 16}, {"missing.png", "", 404, 0}}},
		{"redirect", "example.test", false, []check{
			{"existing.png?w=8", "", 200, 16},
			{"missing.png", "https://example.test/wp-content/uploads/missing.png", 302, 0},
			{"2026/09/missing%20image.jpg?x=a%2Fb&w=100", "https://example.test/wp-content/uploads/2026/09/missing%20image.jpg?x=a%2Fb&w=100", 302, 0},
		}},
		{"photon", "", true, []check{
			{"existing.png", "", 200, 16},
			{"existing.png?w=8", "", 200, 8},
			{"local.txt?w=8", "", 200, 0},
			{"missing.png?w=8", "", 400, 0},
		}},
		{"photon-and-redirect", "http://example.test/media/", true, []check{
			{"existing-upper.PNG?w=8", "", 200, 8},
			{"missing.png?w=8", "http://example.test/media//wp-content/uploads/missing.png?w=8", 302, 0},
		}},
	} {
		t.Run(mode.name, func(t *testing.T) {
			node, goConf := nginxConfigs(t, mode.photon, mode.domain)
			var baseline []response
			for _, runtime := range []struct{ name, conf string }{{"Node", node}, {"Go", goConf}} {
				t.Run(runtime.name, func(t *testing.T) {
					serve(t, runtime.conf)
					for i, want := range mode.checks {
						got, err := probe("/wp-content/uploads/" + want.path)
						if err != nil {
							t.Fatal(err)
						}
						if got.status != want.status || got.location != want.location || got.width != want.width || got.height != want.width*3/4 {
							t.Errorf("%s: got status=%d location=%q image=%dx%d; want status=%d location=%q width=%d", want.path, got.status, got.location, got.width, got.height, want.status, want.location, want.width)
						}
						if want.width == 16 && got.body != encoded.String() {
							t.Errorf("%s: local image contents changed", want.path)
						}
						if runtime.name == "Node" {
							baseline = append(baseline, got)
						} else if got != baseline[i] {
							t.Errorf("%s: Node/Go HTTP responses differ", want.path)
						}
					}
				})
			}
		})
	}
	t.Run("Go-control-characters", func(t *testing.T) {
		view := compose.NewView(&instancedata.InstanceData{MediaRedirectDomain: "https://example.test/\r\nX-Probe:injected"}, compose.Options{})
		serve(t, compose.RenderNginxConf(view))
		got, err := probe("/wp-content/uploads/missing.png")
		if err != nil {
			t.Fatal(err)
		}
		if got.status != 302 || got.location != "https://example.test/%0D%0AX-Probe:injected/wp-content/uploads/missing.png" || got.injected != "" {
			t.Fatalf("unsafe redirect: %+v", got)
		}
	})
}
