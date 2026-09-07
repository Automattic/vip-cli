# Running `vip dev-env` on Podman

`vip dev-env` supports Podman as an alternative to Docker (Docker Desktop,
Colima, OrbStack). Docker remains the default and unaffected engine; this
page covers the extra Podman requirements.

## Requirements

- Podman 5 or newer, either as a rootless Linux install or as the Podman
  machine on macOS.
- A real standalone `docker-compose` v2 binary on `PATH`. `podman-compose`
  is not supported — `vip dev-env` refuses to start under Podman until a
  Compose v2 `docker-compose` is found.
- `net.ipv4.ip_unprivileged_port_start` set to `80` or lower, so Podman's
  rootless proxy can publish port 80. `vip-cli` never changes this setting
  for you; if it is missing, `vip dev-env start` prints the exact remedy
  command for your platform (Podman machine vs. Linux host) as part of its
  preflight output.

## What's different from Docker

- The dev-env proxy publishes on `0.0.0.0` instead of `127.0.0.1` under
  Podman, since Podman's rootless networking needs the explicit bind.
- The proxy container mounts the discovered Podman socket in place of
  `/var/run/docker.sock`, with `security_opt: [label=disable]` added on
  SELinux-enforcing hosts.

None of this requires manual configuration — `vip dev-env` detects Podman
automatically and applies these adjustments on its own.

## Getting the preflight remedy

Run `vip dev-env start`. If a requirement above is unmet, the command exits
with the specific check that failed and the exact command to fix it — that
printed remedy is the authoritative text; this page intentionally does not
duplicate it.
