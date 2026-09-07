package dockercli

import (
	"encoding/json"
	"os/exec"
)

type Engine string

const (
	EngineDocker Engine = "docker"
	EnginePodman Engine = "podman"
)

type EngineInfo struct {
	Engine        Engine
	ServerVersion string
	ComposePlugin bool
	SocketPath    string
	Rootless      bool
}

type InfoRunner func(dockerBin string, args ...string) ([]byte, error)

func dockerFallbackEngineInfo(socketPath string) EngineInfo {
	return EngineInfo{Engine: EngineDocker, ServerVersion: "unknown", SocketPath: socketPath}
}

type dockerInfoShape struct {
	ServerVersion string `json:"ServerVersion"`
	ClientInfo    struct {
		Plugins []struct {
			Name string `json:"Name"`
		} `json:"Plugins"`
	} `json:"ClientInfo"`
}

type podmanInfoShape struct {
	Version struct {
		Version string `json:"Version"`
	} `json:"version"`
	Host struct {
		RemoteSocket struct {
			Path string `json:"path"`
		} `json:"remoteSocket"`
		Security struct {
			Rootless bool `json:"rootless"`
		} `json:"security"`
	} `json:"host"`
	Store struct {
		GraphDriverName string `json:"graphDriverName"`
	} `json:"store"`
}

func hasComposePlugin(shape dockerInfoShape) bool {
	for _, p := range shape.ClientInfo.Plugins {
		if p.Name == "compose" {
			return true
		}
	}
	return false
}

func parseDockerInfo(raw []byte, socketPath string) (EngineInfo, bool) {
	var shape dockerInfoShape
	if err := json.Unmarshal(raw, &shape); err != nil || shape.ServerVersion == "" {
		return EngineInfo{}, false
	}
	return EngineInfo{
		Engine:        EngineDocker,
		ServerVersion: shape.ServerVersion,
		ComposePlugin: hasComposePlugin(shape),
		SocketPath:    socketPath,
	}, true
}

func parsePodmanInfo(raw []byte, socketPath string) (EngineInfo, bool) {
	var shape podmanInfoShape
	if err := json.Unmarshal(raw, &shape); err != nil {
		return EngineInfo{}, false
	}
	if shape.Version.Version == "" || (shape.Host.RemoteSocket.Path == "" && shape.Store.GraphDriverName == "") {
		return EngineInfo{}, false
	}
	resolvedSocket := socketPath
	if resolvedSocket == "" {
		resolvedSocket = shape.Host.RemoteSocket.Path
	}
	return EngineInfo{
		Engine:        EnginePodman,
		ServerVersion: shape.Version.Version,
		SocketPath:    resolvedSocket,
		Rootless:      shape.Host.Security.Rootless,
	}, true
}

func DetectEngine(dockerBin, socketPath string, run InfoRunner) (EngineInfo, error) {
	raw, err := run(dockerBin, "info", "--format", "json")
	if err != nil {
		return EngineInfo{}, err
	}
	if info, ok := parseDockerInfo(raw, socketPath); ok {
		return info, nil
	}
	if info, ok := parsePodmanInfo(raw, socketPath); ok {
		return info, nil
	}
	return dockerFallbackEngineInfo(socketPath), nil
}

func (r *Runner) DetectEngine(socketPath string) (EngineInfo, error) {
	return DetectEngine(r.dockerBin(), socketPath, func(dockerBin string, args ...string) ([]byte, error) {
		return exec.Command(dockerBin, args...).Output()
	})
}
