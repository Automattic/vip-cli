# Testing `vip dev-env` on Windows & WSL (offline-domains feature)

A runbook for building `vip-next` and exercising the offline managed-hosts /
cross-platform elevation feature on a Windows machine — natively and from WSL.

## TL;DR: you do NOT need to sign the binary

There are two unrelated "signing" ideas; don't conflate them:

1. **Authenticode code-signing the `.exe`** (`signtool`, Developer cert, SmartScreen).
   This is **only for distribution**. A binary you build yourself and run from your
   own terminal does **not** need it. It carries no "mark-of-the-web", so Windows
   SmartScreen won't block it. If anything ever warns, "More info → Run anyway".
   **For testing this feature, skip signing entirely.**

2. **The local dev CA** ("WPVIP Local CA") — a self-signed certificate the dev-env
   *generates and trusts automatically* so HTTPS to `*.vipdev.site` is trusted by
   your browser. **You don't do this by hand.** When you run `dev-env start`, the
   CLI adds that CA to the Windows **Root** store and writes the hosts file — both
   under **one UAC prompt** (`certutil -addstore Root` + the hosts edit). That UAC
   prompt is the "signing" you were sensing; it's a runtime elevation, not a build
   step.

So: build → run → approve the UAC prompt. That's it.

## Prerequisites (both paths)

- **Windows 10/11** with administrator rights (the UAC prompt needs to succeed).
- **Docker Desktop** with the **WSL 2 backend** enabled, running.
- **Go 1.27** (`go version` must report 1.27.x — this repo needs it).
- **Git**.
- The repo cloned somewhere (`git clone …/vip`).

This repo uses the standard-library `encoding/json/v2` package available in Go 1.27.

---

## Path A — Build & run inside WSL (recommended)

This exercises the real WSL→Windows bridge: a Linux binary that detects WSL and
edits the **Windows** hosts file + Windows cert store via `powershell.exe`.

### 1. Install Go 1.27 in your WSL distro
```bash
# in WSL (Ubuntu etc.)
cd /tmp
curl -LO https://go.dev/dl/go1.27.0.linux-amd64.tar.gz   # match 1.27.x
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.27.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc && source ~/.bashrc
go version   # go1.27.x linux/amd64
```

### 2. Enable Docker Desktop WSL integration
Docker Desktop → Settings → Resources → WSL Integration → enable your distro.
Confirm in WSL: `docker version` shows both client and server.

### 3. Confirm the WSL→Windows bridge works (the feature depends on it)
```bash
powershell.exe -NoProfile -Command "Write-Output ok"   # must print: ok
```
If `powershell.exe` isn't found, WSL interop is disabled — enable it in
`/etc/wsl.conf` (`[interop] enabled=true`) and `wsl --shutdown` from Windows.

### 4. Build
```bash
cd /path/to/vip
CGO_ENABLED=0 go build -buildvcs=false -o bin/vip-next ./cmd/vip-next
./bin/vip-next --version
```
(`make build` also works if you have `make`; it additionally bundles the
`go-search-replace` helper, which this feature does not need.)

### 5. Run it
```bash
./bin/vip-next dev-env create --slug wintest --start
```
When it reaches the hosts/CA step (after WordPress install), a **UAC prompt pops
on the Windows desktop**. Approve it. Behind it: the WPVIP Local CA is added to
the Windows Root store and `wintest.vipdev.site` (+ `-pma`/`-mailpit` if enabled)
is written to the Windows hosts file.

> Note: env data lives under your WSL home: `~/.local/share/vip/dev-environment/`.

---

## Path B — Build & run natively on Windows (PowerShell)

The binary is a native `.exe` (`GOOS=windows`) → same Windows-hosts/cert path,
just without the WSL bridge.

### 1. Install Go 1.27 for Windows
From <https://go.dev/dl/> (the `.msi`), or `winget install GoLang.Go`. Open a
**new** PowerShell so `go` is on PATH. `go version` → 1.27.x.

### 2. Build (PowerShell)
```powershell
cd C:\path\to\vip
$env:CGO_ENABLED  = "0"
go build -buildvcs=false -o vip-next.exe .\cmd\vip-next
.\vip-next.exe --version
```
(`make` usually isn't present on Windows — use the raw `go build` above.)

### 3. Run it
```powershell
.\vip-next.exe dev-env create --slug wintest --start
```
Run from an **ordinary** (non-admin) PowerShell — the tool raises its own UAC
prompt for the hosts/cert step. Env data lands at
`C:\Users\<you>\.local\share\vip\dev-environment\`.

---

## Verify the feature worked

```powershell
# CA is in the Windows Root store:
certutil -store Root | Select-String "WPVIP"

# Managed hosts block is present (note the BEGIN/END markers):
Get-Content C:\Windows\System32\drivers\etc\hosts | Select-String -Context 0,5 "BEGIN vip-dev-env"

# The site resolves to loopback and is reachable:
ping wintest.vipdev.site            # -> 127.0.0.1
# then open https://wintest.vipdev.site:<port>/ in a browser (no cert warning)
```

From **WSL**, confirm it edited the *Windows* file (not WSL's `/etc/hosts`):
```bash
grep -A6 "BEGIN vip-dev-env" /mnt/c/Windows/System32/drivers/etc/hosts
```

### The actual offline test
1. Start the env (hosts written).
2. Turn off Wi-Fi / pull the network (or block DNS).
3. Reload `https://wintest.vipdev.site:<port>/` — it must still resolve, because
   the hosts file (not public DNS) is doing the work now. That's the whole point.

### Re-prompt behavior
Re-running `dev-env start` on an unchanged env should **not** prompt for UAC again
(the CA is already trusted and the hosts entries already present — the
context-aware `CATrusted` + `HostsPresent` checks short-circuit). If it prompts
every time, that's a bug worth reporting.

---

## Cleanup (to re-test from scratch)

```powershell
# Remove the managed hosts block: edit the file as Administrator and delete
# everything between "# BEGIN vip-dev-env" and "# END vip-dev-env".
notepad C:\Windows\System32\drivers\etc\hosts      # run elevated

# Remove the CA from the Root store (elevated):
certutil -delstore Root "WPVIP Local CA"
```
Or just `vip-next dev-env destroy --slug wintest`, which tears down containers and
recomputes the hosts block (one more UAC prompt).

---

## Known caveats on Windows/WSL

- The dev-env stack (compose, Traefik proxy, setup.sh) was developed and exercised
  primarily on macOS. The hosts/CA elevation path is new and Windows/WSL-aware, but
  **other** parts of the stack may hit Windows path/permission quirks not yet seen.
  If `create`/`start` fails *before* the UAC step, capture the per-env log
  (`…\dev-environment\wintest\logs\*.log`) — that's a separate issue from this
  feature, worth reporting.
- `Start-Process -Verb RunAs` cannot run non-interactively (no desktop session) —
  it needs an interactive Windows session to show the UAC dialog. CI/headless runs
  won't work; this is a manual test.
- If the elevated step fails or you decline the UAC prompt, the CLI now surfaces a
  non-zero exit (it no longer silently reports success), so you'll see an error.
