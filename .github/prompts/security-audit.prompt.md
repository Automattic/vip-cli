---
mode: agent
tools: ['codebase', 'usages', 'editFiles', 'search', 'runCommands']
description: Perform comprehensive security assessment for Node.js/TypeScript CLI applications
---

# Security Audit Command

Perform comprehensive security assessment for Node.js/TypeScript CLI applications

## Instructions

Perform a systematic security audit following these steps, specifically tailored for Node.js/TypeScript command-line interface applications:

### Important Formatting Guidelines

- **Package Names**: Always format package names in backticks (e.g., `@types/node`, `lando`, `jwt-decode`) to prevent accidental mentions when reports are shared in GitHub issues or other platforms
- **Dependency Classification**: Packages listed in the `dependencies` section of package.json should be treated as production dependencies, regardless of whether they appear to be development tools. For example, tools like `lando` or build tools may be listed as production dependencies because they are required for the application's runtime functionality

1. **Environment Setup (Node.js/TypeScript)**

   - Identify Node.js version requirements and compatibility (`engines` field in package.json)
   - Check TypeScript configuration and compilation settings (`tsconfig.json`)
   - Review npm package manager configuration and security settings
   - Assess build tools (Babel, webpack, rollup) and their security configurations
   - Verify runtime environments (Node.js versions, npm versions)
   - Check for npm-shrinkwrap.json or package-lock.json for dependency integrity

2. **Dependency Security (Node.js/npm)**

   - Scan all dependencies for known vulnerabilities using npm-specific tools:
     - `npm audit` - Basic vulnerability scanning
     - `npm audit --json` - Detailed vulnerability data in JSON format
     - `npm audit signatures` - Package integrity verification via npm signatures
     - `npm audit fix --dry-run` - Preview potential fixes without applying
   - Check for outdated packages using `npm outdated` and `npm outdated --json`
   - Review dependency lockfile integrity (npm-shrinkwrap.json or package-lock.json)
   - Analyze transitive dependency vulnerabilities and npm package supply chain risks
   - **Important**: Classify dependencies based on package.json location (`dependencies` vs `devDependencies`), not their apparent purpose
   - Check for package overrides and resolutions in package.json for security patches
   - Review npm configuration (.npmrc) for security settings and registry configurations
   - Assess usage of npm scripts for potential security risks
   - **GitHub Dependencies**: Pay special attention to GitHub-hosted dependencies (e.g., `github:owner/repo#commit`) which may pose additional supply chain risks
   - **Custom Forks**: Identify and assess security implications of custom package forks

3. **Authentication & Authorization (Node.js CLI Context)**

   - Review API authentication mechanisms (JWT tokens, OAuth, API keys, Bearer tokens)
   - Check for secure credential storage using Node.js-specific solutions:
     - OS keychain integration (keytar, node-keytar)
     - Encrypted configuration files
     - Environment variable handling
   - Verify authorization controls for CLI commands and API access
   - Examine credential lifecycle management (creation, rotation, deletion)
   - Assess session management for long-running CLI operations
   - Review multi-user and multi-environment access patterns
   - Check for proper credential isolation between different services/environments
   - Analyze JWT token validation and expiration handling
   - Review OAuth flow implementation and security

4. **Input Validation & Sanitization (Node.js/TypeScript Specific)**

   - Check all user input validation for command arguments and flags using common libraries:
     - `commander`, `yargs`, `minimist`, `args` - Command-line argument parsing
     - Review argument validation, type checking, and sanitization
   - Review command injection prevention for Node.js shell operations:
     - `child_process.exec()`, `child_process.spawn()`, `shelljs` usage
     - Assess proper escaping and validation of shell commands
   - Validate file path traversal protections using Node.js path utilities:
     - `path.resolve()`, `path.normalize()`, `path.isAbsolute()` usage
     - Protection against `../` and absolute path attacks
   - Examine TypeScript type safety for input validation
   - Check for proper handling of special characters in filenames and paths
   - Review input validation for configuration files (JSON, YAML, ENV) and environment variables
   - Assess protection against malicious file uploads, imports, or zip file extraction
   - Review regular expression usage for ReDoS (Regular expression Denial of Service) vulnerabilities
   - Check for prototype pollution vulnerabilities in object property assignments
   - Assess JSON parsing security (`JSON.parse()` with untrusted input)
   - **SQL Injection Prevention**: If the application handles SQL, review SQL query construction and parameterization
   - **File Extension Validation**: Check validation of file extensions and MIME types for file operations
   - **Size Limits**: Verify file size and request size limits to prevent DoS attacks
   - **Content-Type Validation**: Ensure proper validation of file content types beyond extensions

5. **Data Protection (Node.js CLI Context)**

   - Identify sensitive data handling practices (credentials, user data, logs)
   - Check encryption implementation for data at rest and in transit using Node.js libraries:
     - Built-in `crypto` module usage
     - Third-party encryption libraries (`bcrypt`, `argon2`, etc.)
   - Review secure communication protocols (HTTPS, TLS) for API calls:
     - `https`, `node-fetch`, `axios`, `got` library configurations
     - Certificate validation and pinning
   - Assess temporary file security and cleanup practices:
     - `fs.createWriteStream()`, `tmp` package usage
     - Proper file permission setting and cleanup
   - Verify secure handling of configuration files and cache data
   - Check for data leakage in logs, error messages, or debug output
   - Review data persistence and storage locations (local files, system keychains)
   - Assess Buffer and stream handling security for sensitive data

6. **Secrets Management (Node.js/TypeScript)**

   - Scan for hardcoded secrets, API keys, passwords, and tokens using:
     - `grep -r "password\|secret\|api[_-]?key\|token" src/ --include="*.js" --include="*.ts"`
     - `git log --all --full-history --grep="password\|secret\|key"`
   - Check for proper secrets management practices specific to Node.js:
     - Environment variables via `process.env`
     - `.env` file handling with `dotenv` library
     - OS keychain integration with `keytar` or `node-keytar`
   - Review credential storage mechanisms:
     - Encrypted configuration files
     - System keychain integration
     - Temporary credential caching
   - Identify exposed configuration files (.env, .npmrc, config.json)
   - Verify secure defaults for credential handling
   - Assess credential rotation and expiration mechanisms
   - Check for credentials in TypeScript interfaces and type definitions
   - Review npm token and registry authentication security
   - Scan for secrets in test files and fixtures
   - Check for API keys in URL parameters or query strings

7. **Error Handling & Logging (CLI Specific)**

   - Review error messages for information disclosure (stack traces, file paths, credentials)
   - Check logging practices for security events and sensitive data
   - Verify sensitive data is not logged in debug output or error logs
   - Assess error handling robustness and fail-safe behaviors
   - Review console output security (no credential exposure)
   - Check for proper log rotation and cleanup in long-running processes
   - Examine crash dump security and sensitive data handling
   - Assess debug mode security and production vs development logging differences
   - Review stack trace sanitization for production environments
   - **Structured Logging**: Evaluate whether structured logging frameworks are used for security event tracking
   - **Log Injection**: Check for log injection vulnerabilities where user input could manipulate log entries
   - **Audit Trail**: Assess whether security-relevant actions are properly logged for audit purposes
   - **Error Exposure**: Review whether error responses leak internal system information

8. **Node.js/TypeScript CLI-Specific Security Concerns**

   - Review command-line argument parsing security using Node.js libraries
   - Check for shell injection vulnerabilities in Node.js system commands:
     - `child_process.exec()`, `child_process.spawn()`, `child_process.execSync()`
     - `shelljs` library usage and command construction
   - Assess file system access controls and permissions using Node.js fs module
   - Review temporary file creation and cleanup practices:
     - `fs.mkdtemp()`, `tmp` package, `os.tmpdir()` usage
   - Check for race conditions in file operations and async/await patterns
   - Verify proper handling of symbolic links and hard links
   - Assess security of auto-update mechanisms (if present) using npm or custom updaters
   - Review plugin/extension security for Node.js modules
   - Check TypeScript type safety for preventing runtime security issues
   - Analyze package.json `bin` scripts for security vulnerabilities
   - Review npm lifecycle scripts (`preinstall`, `postinstall`) for malicious code
   - Assess process privilege escalation and permission requirements
   - Check for insecure deserialization vulnerabilities (eval, Function constructor)
   - Review memory management and potential memory leaks with sensitive data

9. **Infrastructure Security (Node.js CLI Context)**

   - Review containerization security if CLI runs in containers (Docker, etc.)
   - Check CI/CD pipeline security for CLI distribution and updates
   - Examine npm package distribution security:
     - Package signing and verification
     - npm publish configuration and access controls
     - Package scope and naming security
   - Assess build process security and reproducible builds:
     - Babel, TypeScript compilation security
     - Source map handling and exposure
     - Build artifact integrity
   - Review code signing and package verification for npm packages
   - Check for supply chain attack vectors in build dependencies
   - Assess npm scripts security in package.json
   - Review .npmignore and files field for sensitive data exposure

10. **Network Security (Node.js/TypeScript)**

    - Review API communication security using Node.js HTTP clients:
      - `https` module, `node-fetch`, `axios`, `got` configurations
      - HTTPS enforcement and certificate validation
      - HTTP/2 and TLS version requirements
    - Check proxy and network configuration handling:
      - HTTP_PROXY, HTTPS_PROXY environment variable handling
      - Proxy authentication and security
      - Corporate firewall and proxy bypass security
    - Verify secure handling of network timeouts and retries
    - Assess protection against DNS attacks and domain validation
    - Review firewall and network access requirements
    - Check for secure handling of network credentials and proxies
    - Analyze GraphQL client security (Apollo Client, etc.) if applicable
    - Review WebSocket security for real-time connections (if applicable)

11. **Security Testing & Continuous Monitoring**

    - Assess current security testing coverage and methodology
    - Review integration of security tools in CI/CD pipeline:
      - Automated dependency vulnerability scanning
      - Static Application Security Testing (SAST) integration
      - Secret scanning in commits and pull requests
    - Evaluate security linting and code quality gates
    - Check for security-focused unit tests and integration tests
    - Review update notification and patch management processes
    - Assess security incident response and monitoring capabilities
    - Evaluate security documentation and developer training coverage

12. **Reporting**
    - Document all findings with severity levels (Critical, High, Medium, Low)
    - Provide specific remediation steps for each issue
    - Include code examples and file references with line numbers
    - Create an executive summary with key recommendations
    - Generate actionable security improvement roadmap
    - **Note**: All package names should be formatted in backticks (e.g., `package-name`) throughout the report

## Required Tools and Commands

Execute these commands as part of the Node.js/TypeScript security audit process:

### Node.js/npm Dependency Security Analysis

```bash
npm audit                           # Basic vulnerability scan
npm audit --json                    # Detailed vulnerability data
npm audit signatures                # Package integrity verification
npm audit fix --dry-run             # Preview potential fixes
npm ls --depth=0                    # Top-level dependency analysis
npm ls --production                 # Production dependencies only
npm outdated                        # Check for security updates
npm outdated --json                 # Detailed update information
npx depcheck                        # Find unused dependencies
```

### Node.js/TypeScript Secrets and Credential Scanning

```bash
grep -r "password\|secret\|api[_-]?key\|token" src/ --include="*.js" --include="*.ts"
grep -r "process\.env\." src/ --include="*.js" --include="*.ts"
grep -r "hardcoded\|FIXME.*password\|TODO.*secret" src/
find . -name "*.env*" -o -name "*config*" -o -name "*credential*" -o -name ".npmrc"
grep -r "Bearer\s\|Basic\s" src/ --include="*.js" --include="*.ts"
grep -r "eval\|Function\|new Function" src/ --include="*.js" --include="*.ts"
find . -name "__tests__" -o -name "test" -o -name "*.test.*" -o -name "*.spec.*" | xargs grep -l "password\|secret\|key"
grep -r "github\.com.*token\|gitlab\.com.*token" . --include="*.js" --include="*.ts" --include="*.json"
git log --all --oneline | head -20 | grep -i "password\|secret\|key\|token"
```

### Node.js Input Validation and Command Security Assessment

```bash
grep -r "process\.argv\|commander\|yargs\|minimist\|args" src/ --include="*.js" --include="*.ts"
grep -r "child_process\|exec\|spawn\|shelljs" src/ --include="*.js" --include="*.ts"
grep -r "fs\.\|path\.\|require\|import.*fs" src/ --include="*.js" --include="*.ts"
grep -r "input.*validation\|sanitize\|escape" src/ --include="*.js" --include="*.ts"
grep -r "\.sql\|CREATE\|INSERT\|UPDATE\|DELETE\|DROP" src/ --include="*.js" --include="*.ts"
find src/ -name "*.js" -o -name "*.ts" | xargs grep -l "RegExp\|new RegExp" | head -10
```

### TypeScript and Code Quality Security Patterns

```bash
grep -r "console\.log\|console\.error\|console\.warn" src/ --include="*.js" --include="*.ts"
find src/ -name "*.js" -o -name "*.ts" | xargs grep -l "Authorization.*Bearer\|basicAuth"
grep -r "jwt\|token\|auth" src/ --include="*.js" --include="*.ts"
find . -name "tsconfig.json" -o -name "babel.config.*" -o -name ".babelrc*"
grep -r "any\|unknown" src/ --include="*.ts" | head -20  # Check for loose TypeScript typing
grep -r "JSON\.parse\|JSON\.stringify" src/ --include="*.js" --include="*.ts"
```

### Node.js Network and API Security

```bash
grep -r "https\?\|fetch\|axios\|got\|request" src/ --include="*.js" --include="*.ts"
grep -r "proxy\|HTTP_PROXY\|HTTPS_PROXY" src/ --include="*.js" --include="*.ts"
grep -r "apollo\|graphql" src/ --include="*.js" --include="*.ts"
grep -r "rejectUnauthorized.*false\|strictSSL.*false" src/ --include="*.js" --include="*.ts"
```

### Security Configuration and Best Practices

```bash
find . -name ".gitignore" -exec grep -l "\.env\|config\|secret" {} \;
npm run --silent | grep -E "test|security|audit"  # Check for security-related scripts
find . -name "*.json" -exec grep -l "private.*true" {} \;  # Check for private package settings
grep -r "TODO\|FIXME\|HACK\|XXX" src/ --include="*.js" --include="*.ts" | grep -i "security\|auth\|password"
find . -name "Dockerfile*" -o -name "docker-compose*" -o -name ".dockerignore"
find . -name ".github" -type d -exec find {} -name "*.yml" -o -name "*.yaml" \;
ls -la . | grep -E "^\-.*\s\." # Check for hidden configuration files
```

## Expected Output Format

Provide a structured security assessment report with the following sections:

### Executive Summary

- Brief overview of security posture and risk assessment
- Key security findings and severity breakdown
- Priority recommendations and remediation timeline
- Overall security score and risk level assessment

### Environment and Technology Assessment

- Node.js/TypeScript CLI framework and technology stack analysis
- npm package manager and dependency management evaluation
- TypeScript configuration and type safety assessment
- Build process (Babel, TypeScript compiler) security evaluation

### Dependency Security Analysis

- npm vulnerability count by severity level (Critical/High/Medium/Low)
- Specific CVEs and package vulnerability details (with package names in backticks)
- npm supply chain security concerns and recommendations
- TypeScript @types/\* package security assessment

### Authentication and Authorization Assessment

- Credential management and storage security evaluation
- API authentication mechanism analysis
- Authorization control effectiveness review

### Input Validation and Command Security

- User input validation coverage assessment
- Command injection vulnerability analysis
- File system access security review

### Data Protection and Privacy

- Sensitive data handling practices evaluation
- Encryption implementation assessment
- Data leakage and exposure risk analysis
- Memory management security for sensitive data

### Infrastructure and Distribution Security

- Build process and CI/CD security evaluation
- Package distribution and update mechanism security
- Container and deployment security (if applicable)
- Supply chain attack vector assessment

### Security Monitoring and Incident Response

- Security logging and monitoring capabilities assessment
- Incident response readiness evaluation
- Security testing coverage analysis

### Security Testing and Monitoring Assessment

- Security testing integration in development lifecycle
- CI/CD security gate effectiveness and coverage
- Dependency vulnerability monitoring and alerting
- Security incident response capability assessment

### Compliance and Risk Assessment

- Industry standard compliance evaluation (OWASP, NIST)
- Risk assessment matrix with impact and likelihood ratings
- Regulatory compliance considerations (if applicable)
- Third-party security dependency evaluation

### Action Plan

- **Phase 1 (Immediate)**: Critical and high-severity issues requiring immediate attention
- **Phase 2 (Short-term)**: Medium-severity issues and security hardening
- **Phase 3 (Long-term)**: Security improvements and monitoring implementation

### Technical Details

- Complete vulnerability inventory with npm-specific remediation steps
- Node.js/TypeScript code examples and file references for security issues
- npm audit and security tool command outputs and evidence
- TypeScript configuration and security recommendations
- Node.js best practices and security configuration recommendations

Use Node.js/TypeScript-specific security scanning tools and provide manual review for complex security patterns specific to Node.js command-line applications. Focus on the unique security challenges of Node.js CLI tools including npm dependency management, TypeScript type safety, credential management, file system access, and command injection prevention.

## Key Security Patterns to Investigate

### High-Risk Code Patterns

- Dynamic `require()` or `import()` with user input
- `eval()`, `Function()`, or `vm` module usage
- Unsafe regular expressions (ReDoS vulnerabilities)
- Prototype pollution via object property assignment
- Unvalidated file paths in filesystem operations
- Shell command construction with user input
- Unsafe deserialization of user-provided data

### Configuration Security Concerns

- Environment variable exposure in error messages
- Default credentials or weak password generation
- Insecure HTTP connections to APIs
- Missing certificate validation (`rejectUnauthorized: false`)
- Overly permissive CORS or security headers
- Debug information exposure in production builds

### Dependency Security Red Flags

- GitHub-hosted dependencies without version pinning
- Packages with known high-severity vulnerabilities
- Unmaintained packages (last update > 2 years)
- Packages with excessive permissions or capabilities
- Development dependencies included in production builds

## Deliverables

1. **Console Output**: Display the complete security audit report directly in the chat/console
2. **Markdown File**: Create an untitled markdown file (e.g., `untitled:Security-Audit-Report.md`) containing the complete report for easy saving and sharing

The markdown file should be formatted identically to the console output, allowing users to save it for documentation purposes or share with team members.
