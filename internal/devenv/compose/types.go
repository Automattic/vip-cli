// Package compose renders a docker-compose.yml (plus .env and nginx
// extra.conf) for a vip dev environment from an instancedata.InstanceData.
// Ports assets/dev-env.lando.template.yml.ejs to a real compose file: the
// Lando type:compose services map ~1:1 to compose services; the Lando
// proxy:/ssl: keys become Traefik labels; run/run_as_root/initOnly become
// lifecycle metadata (SetupSteps). Output is a typed model marshaled with
// yaml.v3 for guaranteed-valid, deterministic YAML.
package compose

// Project is the top-level docker-compose document.
type Project struct {
	Name     string                     `yaml:"name"`
	Services map[string]*Service        `yaml:"services"`
	Volumes  map[string]*TopLevelVolume `yaml:"volumes,omitempty"`
	Networks map[string]*Network        `yaml:"networks,omitempty"`
}

// Service is one compose service. Field order here is the YAML emission order.
type Service struct {
	Image       string               `yaml:"image,omitempty"`
	Command     string               `yaml:"command,omitempty"`
	Entrypoint  string               `yaml:"entrypoint,omitempty"`
	WorkingDir  string               `yaml:"working_dir,omitempty"`
	EnvFile     []string             `yaml:"env_file,omitempty"`
	Environment map[string]string    `yaml:"environment,omitempty"`
	Ports       []string             `yaml:"ports,omitempty"`
	DependsOn   map[string]DependsOn `yaml:"depends_on,omitempty"`
	Volumes     []VolumeMount        `yaml:"volumes,omitempty"`
	Labels      map[string]string    `yaml:"labels,omitempty"`
	Networks    []string             `yaml:"networks,omitempty"`
	Deploy      *Deploy              `yaml:"deploy,omitempty"`
}

// DependsOn models the long-form depends_on condition.
type DependsOn struct {
	Condition string `yaml:"condition"`
}

// Deploy models the subset of deploy we emit (elasticsearch memory limit).
type Deploy struct {
	Resources Resources `yaml:"resources"`
}

type Resources struct {
	Limits ResourceLimits `yaml:"limits"`
}

type ResourceLimits struct {
	Memory string `yaml:"memory"`
}

// TopLevelVolume is a named volume. When External is true the volume is
// expected to already exist (used for migrating Lando-created data volumes);
// Name then carries the externally-managed volume name.
type TopLevelVolume struct {
	External bool   `yaml:"external,omitempty"`
	Name     string `yaml:"name,omitempty"`
}

// Network is a top-level network reference (the shared proxy network is
// declared external so all environments share it).
type Network struct {
	External bool   `yaml:"external,omitempty"`
	Name     string `yaml:"name,omitempty"`
}

// VolumeMount is one entry of a service's volumes:. Short, when set, emits the
// compact "src:dst[:opts]" string form. Otherwise the long mapping form is
// emitted (used for named volumes with the nocopy option).
type VolumeMount struct {
	Short  string // compact form; if set, the long fields are ignored
	Type   string // long form: "volume" or "bind"
	Source string
	Target string
	NoCopy bool
}

// MarshalYAML emits either the short string or the long mapping form.
func (v VolumeMount) MarshalYAML() (any, error) {
	if v.Short != "" {
		return v.Short, nil
	}
	type vol struct {
		Nocopy bool `yaml:"nocopy"`
	}
	type longForm struct {
		Type   string `yaml:"type"`
		Source string `yaml:"source"`
		Target string `yaml:"target"`
		Volume *vol   `yaml:"volume,omitempty"`
	}
	lf := longForm{Type: v.Type, Source: v.Source, Target: v.Target}
	if v.NoCopy {
		lf.Volume = &vol{Nocopy: true}
	}
	return lf, nil
}
