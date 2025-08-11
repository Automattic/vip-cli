---
mode: agent
tools: ['codebase', 'usages', 'editFiles', 'search', 'runCommands']
description: Security audit for Node.js/TypeScript CLI applications
---

# Security Audit

Perform a comprehensive security assessment for Node.js/TypeScript CLI applications.

## Core Requirements

**MANDATORY TOOLS:** Semgrep, CodeQL, and npm dependency analysis are required for all audits.

**FORMATTING:** Use backticks for package names (e.g., `@types/node`, `express`) in all reports.

## Security Analysis Steps

### 1. Tool Setup and Installation

Install required security tools:

```bash
# Install Semgrep via pipx (recommended)
if ! command -v pipx &> /dev/null; then
    sudo apt update && sudo apt install -y pipx
fi

if ! command -v semgrep &> /dev/null; then
    pipx install semgrep
fi

# Install CodeQL (check first to avoid large download)
if ! command -v codeql &> /dev/null && [ ! -f "./codeql/codeql" ]; then
    wget -q https://github.com/github/codeql-cli-binaries/releases/latest/download/codeql-linux64.zip
    unzip -q codeql-linux64.zip && rm codeql-linux64.zip
    export PATH=$PATH:$(pwd)/codeql
fi

# Download JavaScript query pack if needed
CODEQL_CMD=$(command -v codeql 2>/dev/null || echo "./codeql/codeql")
if [ -x "$CODEQL_CMD" ] && [ ! -d "./codeql/qlpacks/codeql/javascript-queries" ]; then
    $CODEQL_CMD pack download codeql/javascript-queries
fi

# Verify tools
semgrep --version && echo "✅ Semgrep ready"
($CODEQL_CMD version &> /dev/null) && echo "✅ CodeQL ready"
echo "✅ Retire.js ready (via npx)"
```

### 2. Static Analysis (MANDATORY)

Run comprehensive security scans:

```bash
# Semgrep - Multiple security rulesets
semgrep --config=auto --json --output=semgrep-results.json src/
semgrep --config=p/nodejs --config=p/typescript --config=p/secrets src/
semgrep --config=p/supply-chain --config=p/owasp-top-ten --config=p/cwe-top-25 src/
semgrep --config=p/security-audit src/

# CodeQL - Semantic analysis
CODEQL_CMD=$(command -v codeql 2>/dev/null || echo "./codeql/codeql")
$CODEQL_CMD database create codeql-db --language=javascript --source-root=src/
$CODEQL_CMD database analyze codeql-db codeql/javascript-queries --format=sarif-latest --output=codeql-results.sarif

# Retire.js - JavaScript vulnerabilities
npx retire --outputformat json --outputpath retire-results.json src/
npx retire --path node_modules/ --outputformat json --outputpath retire-node-modules.json
```

### 3. Dependency Analysis (MANDATORY)

Analyze npm dependencies for vulnerabilities:

```bash
# Required dependency commands
npm audit                           # Basic vulnerability scan
npm audit --json                    # Detailed vulnerability data
npm ls --depth=0                    # Top-level dependencies
npm ls --production                 # Production dependencies only
npm outdated                        # Check for updates
npm outdated --json                 # Detailed update information
npx depcheck                        # Find unused dependencies

# Additional checks
npm audit signatures                # Package integrity verification
npm audit fix --dry-run             # Preview fixes
```

### 4. Security Review Areas

Focus on these key security aspects:

**Authentication & Authorization**

- JWT tokens, OAuth, API keys, Bearer tokens
- Credential storage (keychain, encrypted config, environment variables)
- Authorization controls and session management

**Input Validation & Injection Prevention**

- Command-line argument parsing (`commander`, `yargs`, `minimist`)
- Shell command execution (`child_process`, `shelljs`)
- File path validation and directory traversal prevention
- SQL injection and command injection vulnerabilities

**Secrets Management**

- Hardcoded credentials, API keys, passwords
- Environment variable usage (`process.env`)
- Git history secret scanning
- Configuration file security

**Data Protection**

- Encryption implementation (`crypto` module)
- HTTPS/TLS configuration for API calls
- Temporary file security and cleanup
- Sensitive data in logs and error messages

**Network Security**

- HTTP client security (`axios`, `node-fetch`, `got`)
- Proxy configuration and certificate validation
- GraphQL and WebSocket security (if applicable)

**Node.js Specific Concerns**

- File system permissions and operations
- Package.json security (`bin` scripts, lifecycle hooks)
- TypeScript type safety for security
- Build process and distribution security

## Security Scanning Commands

Use semantic search when available for intelligent analysis, otherwise fall back to pattern matching.

### Secrets and Credentials

Use both semantic search when available for intelligent analysis and semgrep:

```bash
# Semgrep for advanced secret detection
semgrep --config=p/secrets --config=p/security-audit src/
```

### Input Validation and Security Patterns

Use semantic search when available for intelligent analysis, otherwise fall back to pattern matching:

```bash
# Command execution and validation
grep -r "process\.argv\|commander\|yargs\|minimist" src/ --include="*.js" --include="*.ts"
grep -r "child_process\|exec\|spawn\|shelljs" src/ --include="*.js" --include="*.ts"
grep -r "fs\.\|path\.\|require.*fs" src/ --include="*.js" --include="*.ts"

# Network and authentication
grep -r "https\?\|fetch\|axios\|got" src/ --include="*.js" --include="*.ts"
grep -r "jwt\|token\|auth" src/ --include="*.js" --include="*.ts"
```

## Report Structure

Provide a comprehensive security assessment with these sections:

### Executive Summary

- Security posture overview and risk assessment
- Key findings breakdown by severity (Critical/High/Medium/Low)
- Priority recommendations and remediation timeline

### Dependency Security Analysis

- npm vulnerability count by severity with specific CVEs
- Package names in backticks (e.g., `express`, `lodash`)
- Outdated packages requiring security updates
- Supply chain security concerns

### Security Review Findings

- Authentication and credential management issues
- Input validation and injection vulnerabilities
- Data protection and encryption concerns
- Network security configuration problems
- Node.js-specific security risks

### Action Plan

- **Phase 1 (Immediate)**: Critical and high-severity fixes
- **Phase 2 (Short-term)**: Medium-severity issues and hardening
- **Phase 3 (Long-term)**: Security monitoring and improvements

### Technical Details

- Complete vulnerability inventory with file references
- Code examples showing security issues
- Specific remediation steps for each finding
- Node.js/TypeScript best practices recommendations

## DELIVERABLES

1. **Console Output**: Complete security report displayed in chat
2. **Markdown File**: Create `Security-Audit-Report.md` with identical content for saving/sharing
