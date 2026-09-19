package compose

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestVolumeMountShortAndLongForm(t *testing.T) {
	short := VolumeMount{Short: "./config:/wp/config"}
	sb, err := yaml.Marshal([]VolumeMount{short})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(sb), "- ./config:/wp/config") {
		t.Fatalf("short form wrong:\n%s", sb)
	}

	long := VolumeMount{
		Type:   "volume",
		Source: "devtools",
		Target: "/dev-tools",
		NoCopy: true,
	}
	lb, err := yaml.Marshal([]VolumeMount{long})
	if err != nil {
		t.Fatal(err)
	}
	got := string(lb)
	for _, want := range []string{"type: volume", "source: devtools", "target: /dev-tools", "nocopy: true"} {
		if !strings.Contains(got, want) {
			t.Fatalf("long form missing %q:\n%s", want, got)
		}
	}
}

func TestProjectMarshalsDeterministically(t *testing.T) {
	p := &Project{
		Name: "example",
		Services: map[string]*Service{
			"memcached": {
				Image:   "memcached:1.6-alpine",
				Command: "memcached -m 64",
				Environment: map[string]string{
					"LANDO_NEEDS_EXEC": "1",
				},
			},
		},
	}
	out, err := yaml.Marshal(p)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	for _, want := range []string{"name: example", "services:", "memcached:", "image: memcached:1.6-alpine", "command: memcached -m 64", "LANDO_NEEDS_EXEC:"} {
		if !strings.Contains(got, want) {
			t.Fatalf("marshaled compose missing %q:\n%s", want, got)
		}
	}
}
