# Defensive Mode CLI Commands

**Commands**: `vip defensive-mode enable`, `vip defensive-mode disable`, `vip defensive-mode status`
**Available in**: VIP-CLI 3.23.0+
**Minimum Role**: Org Admin or App Admin (for enable/disable)

## Overview

Defensive Mode is VIP's bot and DDoS protection system that automatically detects and blocks malicious traffic at the edge. These CLI commands allow you to automate Defensive Mode management across your VIP environments.

**What is Defensive Mode?**
- Automatically detects bot and DDoS attack patterns
- Challenges suspicious requests before they reach your application
- Reduces server load during attacks
- Configurable threshold and challenge types

**Use Cases**:
- Enable protection before planned traffic spikes
- Automate protection for multiple sites
- Integrate with CI/CD pipelines
- Quick response to ongoing attacks

## Commands

### `vip defensive-mode enable`

Enable bot and DDoS protection for an environment.

**Syntax**:
```bash
vip @app.env defensive-mode enable [options]
```

**Options**:
- `--format=json` - Output results in JSON format (for automation)

**Examples**:

Enable defensive mode for a single environment:
```bash
vip @example-app.production defensive-mode enable
```

Output:
```
✓ Defensive Mode enabled for example-app (production)

Status:  ACTIVE
Threshold: 90% PHP workers
```

Enable with JSON output for automation:
```bash
vip @example-app.production defensive-mode enable --format=json
```

Output:
```json
{
  "data": {
    "statusUpdated": true,
    "configUpdated": false,
    "effective": {
      "enabled": true,
      "connectionThresholdPercentage": 90,
      "challengeType": 1,
      "maxRequestRate": 10,
      "priorityBypass": 3
    }
  },
  "status": "success"
}
```

**Exit Codes**:
- `0` - Success
- `1` - General error (API failure, network issue)
- `2` - Permission denied

---

### `vip defensive-mode disable`

Disable bot and DDoS protection for an environment.

**Syntax**:
```bash
vip @app.env defensive-mode disable [options]
```

**Options**:
- `--confirm` - Skip confirmation prompt (for automation)
- `--format=json` - Output results in JSON format

**Interactive Mode** (default):

```bash
vip @example-app.production defensive-mode disable
```

Output:
```
⚠  Warning
You are about to disable Defensive Mode for example-app (production)
This will remove bot/DDoS protection from https://example.com

Type 'DISABLE' to confirm: _
```

After typing "DISABLE":
```
✓ Defensive Mode disabled for example-app (production)

Status: INACTIVE
```

**Non-Interactive Mode** (automation):

```bash
vip @example-app.production defensive-mode disable --confirm
```

⚠️ **Warning**: Use `--confirm` carefully. Disabling protection during an active attack can cause site outages.

**Exit Codes**:
- `0` - Success or cancelled by user
- `1` - General error
- `2` - Permission denied

---

### `vip defensive-mode status`

Display current Defensive Mode configuration and status.

**Syntax**:
```bash
vip @app.env defensive-mode status [options]
```

**Options**:
- `--format=json` - Output results in JSON format

**Example** (Active):

```bash
vip @example-app.production defensive-mode status
```

Output:
```
Defensive Mode Status: example-app (production)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:          ACTIVE

Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Threshold:       90% PHP workers (default)
Challenge:       Proof of Work (default)
Max Rate:        10 req/s per client (default)
Hysteresis:      300s (default)
Priority Bypass: Level 3 (default)
```

**Example** (Inactive):

```bash
vip @example-app.develop defensive-mode status
```

Output:
```
Defensive Mode Status: example-app (develop)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status:          INACTIVE
```

**JSON Output**:

```bash
vip @example-app.production defensive-mode status --format=json
```

Output:
```json
{
  "data": {
    "stored": null,
    "effective": {
      "enabled": true,
      "connectionThresholdPercentage": 90,
      "challengeType": 1,
      "maxRequestRate": 10,
      "keepEnabledUnderThresholdForSeconds": 300,
      "priorityBypass": 3
    }
  },
  "status": "success"
}
```

---

## Configuration Fields

When viewing status, you may see these configuration fields:

### Threshold

**WordPress Sites**:
- Shown as: "XX% PHP workers"
- Meaning: Defensive Mode activates when PHP worker usage exceeds this percentage
- Default: 90%

**Node.js Sites**:
- Shown as: "XXX concurrent requests"
- Meaning: Defensive Mode activates when concurrent requests exceed this number
- Default: 100

### Challenge Type

The type of challenge presented to suspicious clients:

- **Proof of Work** (default): Client must solve a computational puzzle
- **Interactive Challenge**: Client must complete a CAPTCHA-like challenge

### Max Request Rate

Maximum requests per second allowed from a single client:
- **Unlimited**: No per-client rate limit
- **XX req/s per client**: Specific rate limit

### Hysteresis

Duration (in seconds) that Defensive Mode remains active after traffic drops below threshold:
- Prevents rapid toggling during fluctuating attack patterns
- Default: 300 seconds (5 minutes)

### Priority Bypass

Priority level for bypass rules (1-3):
- Affects which requests can bypass Defensive Mode challenges
- Default: 3

---

## Bulk Operations

To manage multiple environments, use shell scripting:

**Example: Enable for Multiple Sites**

```bash
#!/bin/bash
# bulk-enable-defensive-mode.sh

set -euo pipefail

ENVIRONMENTS=(
  "app1.production"
  "app2.production"
  "app3.production"
)

for env in "${ENVIRONMENTS[@]}"; do
  echo "Enabling Defensive Mode for $env..."

  if vip @"$env" defensive-mode enable --format=json > /dev/null; then
    echo "✓ Success: $env"
  else
    echo "✗ Failed: $env"
  fi

  # Prevent rate limiting
  sleep 2
done
```

**Example: Check Status Across Sites**

```bash
#!/bin/bash
# check-defensive-mode-status.sh

while IFS= read -r env; do
  STATUS=$(vip @"$env" defensive-mode status --format=json 2>/dev/null)
  ENABLED=$(echo "$STATUS" | jq -r '.data.effective.enabled')

  if [ "$ENABLED" == "true" ]; then
    echo "✓ $env: ENABLED"
  else
    echo "✗ $env: DISABLED"
  fi
done < environments.txt
```

---

## CI/CD Integration

**GitHub Actions Example**:

```yaml
name: Enable Defensive Mode Before Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-with-protection:
    runs-on: ubuntu-latest
    steps:
      - name: Install VIP-CLI
        run: npm install -g @automattic/vip

      - name: Authenticate
        env:
          VIP_TOKEN: ${{ secrets.VIP_TOKEN }}
        run: echo "$VIP_TOKEN" | vip login --token

      - name: Enable Defensive Mode
        run: |
          vip @myapp.production defensive-mode enable --format=json

      - name: Deploy Application
        run: vip @myapp.production app deploy ./build.tar.gz

      - name: Verify Defensive Mode Active
        run: |
          STATUS=$(vip @myapp.production defensive-mode status --format=json)
          ENABLED=$(echo "$STATUS" | jq -r '.data.effective.enabled')
          if [ "$ENABLED" != "true" ]; then
            echo "ERROR: Defensive Mode not active!"
            exit 1
          fi
```

---

## Error Messages

### Permission Denied

```
Error: Insufficient permissions to manage Defensive Mode

Required role: Org Admin or App Admin
Your current role: App Write

To resolve: Contact your organization admin to upgrade your role
```

**Solution**: Request Org Admin or App Admin role from your organization administrator.

### App or Environment Not Found

```
Error: Application not found: example-app
```

**Solution**: Verify the app name is correct using `vip app list`.

### Network or API Error

```
Error: Failed to enable Defensive Mode: API request timed out (network timeout after 30s)

Suggestions:
  1. Verify your network connection
  2. Try again in a few moments
  3. Check VIP status: https://status.wpvip.com/
```

**Solution**: Check network connection and retry. If problem persists, check VIP status page.

---

## Permissions

**To view status** (read-only):
- Any authenticated VIP user

**To enable or disable** (write):
- Organization Admin
- Application Admin

Check your current role:
```bash
vip whoami
```

---

## Best Practices

### Production Environments

✅ **DO**:
- Enable Defensive Mode before expected traffic spikes
- Test automation scripts in non-production environments first
- Use `status` command to check current state before making changes
- Monitor audit logs for unexpected changes
- Keep confirmation prompts enabled for manual operations

❌ **DON'T**:
- Disable protection during active attacks without careful assessment
- Use `--confirm` flag in interactive terminal sessions
- Toggle defensive mode rapidly (can trigger rate limits)
- Share automation scripts containing `--confirm` without warnings

### Automation Scripts

✅ **DO**:
- Add `sleep 2` between operations to avoid rate limits
- Check status before making changes (idempotent operations)
- Use `--format=json` for reliable parsing
- Handle errors gracefully (use `set -euo pipefail`)
- Log all operations for audit trail

❌ **DON'T**:
- Run parallel operations against the same environment
- Ignore exit codes in scripts
- Use `--confirm` without understanding the risks

---

## Troubleshooting

### Command Not Found

```bash
bash: vip: command not found
```

**Solution**: Install VIP-CLI:
```bash
npm install -g @automattic/vip
```

### Authentication Required

```bash
Error: No authentication token found
```

**Solution**: Log in to VIP:
```bash
vip login
```

### Rate Limit Exceeded

```bash
Error: Too many requests (429)
```

**Solution**: Wait 1-2 minutes, then retry. Add delays (`sleep 2`) between operations in scripts.

---

## Related Commands

- `vip app list` - List your VIP applications
- `vip whoami` - Check your current role and permissions
- `vip logout` - Log out of VIP-CLI

---

## Support

For help with Defensive Mode:
- Dashboard: https://dashboard.wpvip.com/
- VIP Support: Create a ticket in the Dashboard
- Documentation: https://docs.wpvip.com/

For CLI issues:
- GitHub: https://github.com/Automattic/vip-cli/issues
- Slack: #vip-cli (Automattic internal)

---

## Changelog

### 3.23.0 (2026-03-03)
- Initial release of defensive-mode commands
- `enable`, `disable`, and `status` subcommands
- JSON output support for automation
- Interactive confirmation for disable operations
