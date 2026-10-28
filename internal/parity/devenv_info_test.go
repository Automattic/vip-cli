//go:build parity

package parity

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/Automattic/vip/internal/devenv"
	"github.com/Automattic/vip/internal/devenv/dockercli"
	"github.com/Automattic/vip/internal/devenv/instancedata"
	"github.com/Automattic/vip/internal/devenv/proxy"
)

func TestDevEnvInfoServiceConnectionsDifferential(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Docker CLI fixture uses a POSIX shell")
	}
	nodeBin := ResolveNodeVipBin(os.Getenv("NODE_VIP_BIN"), DefaultNodeVipBinProbe())
	if !nodeBin.Ready {
		t.Skip(LoudSkip("dev-env info differential", nodeBin.Reason))
	}
	fixture, err := os.ReadFile("../../testdata/parity/devenv-info-services.json")
	if err != nil {
		t.Fatal(err)
	}
	var original []dockercli.ServiceState
	if err := json.Unmarshal(fixture, &original); err != nil {
		t.Fatal(err)
	}
	root, _ := filepath.Abs("../..")
	for _, mode := range []string{"running", "stopped", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			t.Setenv("XDG_DATA_HOME", dir)
			t.Setenv("DOCKER_HOST", "tcp://fixture.invalid:2375")
			states := append([]dockercli.ServiceState(nil), original...)
			if mode == "stopped" {
				for i := range states {
					states[i].State = "exited"
				}
			}
			if mode == "disabled" {
				states = states[:2]
			}
			body, err := json.Marshal(states)
			if err != nil {
				t.Fatal(err)
			}
			edgeWrite(t, dir, "states.json", body, 0600)
			edgeWrite(t, dir, "docker", []byte("#!/bin/sh\ncase \"$*\" in\n 'compose version') exit 0;;\n 'compose -p demo ps --format json --all') cat \"$(dirname \"$0\")/states.json\";;\n *) exit 1;;\nesac\n"), 0755)
			t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
			data := &instancedata.InstanceData{SiteSlug: "demo", Domain: "vipdev.site", PHPMyAdmin: mode != "disabled", Mailpit: mode != "disabled", Elasticsearch: json.RawMessage("true"), Photon: true}
			if err := instancedata.Write("demo", data); err != nil {
				t.Fatal(err)
			}
			if err := proxy.SavePorts(proxy.PortsStatePath(), proxy.Ports{HTTP: 8000, HTTPS: 444}); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			got, err := devenv.Info(ctx, "demo")
			if err != nil {
				t.Fatal(err)
			}
			nodeModule, _ := filepath.Abs(filepath.Join(filepath.Dir(nodeBin.Path), "../lib/dev-environment/dev-environment-lando.js"))
			cmd := exec.CommandContext(ctx, "node", filepath.Join(root, "testdata/parity/devenv-info-node.cjs"), nodeModule, filepath.Join(dir, "vip/dev-environment/demo"), filepath.Join(dir, "states.json"))
			cmd.Env = FixtureEnv(map[string]string{"XDG_DATA_HOME": dir})
			node, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("Node info: %v\n%s", err, node)
			}
			var info map[string]any
			if err := json.Unmarshal(node, &info); err != nil {
				t.Fatalf("%v\n%s", err, node)
			}
			want := map[string][]string{}
			isConnection := func(label string) bool {
				return strings.HasSuffix(label, " URLS") || label == "DATABASE" || label == "ENTERPRISE SEARCH" || label == "PHOTON"
			}
			for key, value := range info {
				label := strings.ToUpper(key)
				if !isConnection(label) {
					continue
				}
				switch value := value.(type) {
				case string:
					want[label] = []string{value}
				case []any:
					for _, item := range value {
						want[label] = append(want[label], item.(string))
					}
				}
			}
			actual := map[string][]string{}
			row := regexp.MustCompile(`^ ([A-Z][A-Z ]*?)  +(.*)$`)
			label := ""
			for _, line := range strings.Split(strings.TrimSuffix(got, "\n"), "\n") {
				if match := row.FindStringSubmatch(line); match != nil {
					label = match[1]
					if isConnection(label) {
						actual[label] = []string{match[2]}
					}
				} else if isConnection(label) {
					actual[label] = append(actual[label], strings.TrimSpace(line))
				}
			}
			if !reflect.DeepEqual(actual, want) {
				t.Fatalf("service connections differ\nGo: %#v\nNode: %#v\n%s", actual, want, got)
			}
		})
	}
}
