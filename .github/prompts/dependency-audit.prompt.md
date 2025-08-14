---
mode: agent
tools: ['codebase', 'usages', 'editFiles', 'search', 'runCommands']
description: Audit dependencies for security vulnerabilities
---

# Dependency Audit Command

Audit dependencies for security vulnerabilities

## Instructions

Perform a comprehensive dependency audit for Node.js/TypeScript projects following these steps:

**🔍 PRIORITIZE SEMANTIC SEARCH**: Use semantic search extensively throughout the audit to understand actual dependency usage patterns, find related code, and identify potential issues that command-line tools might miss.

### Important Formatting Guidelines

- **Package Names**: Always format package names in backticks (e.g., `@types/node`, `lando`, `@apollo/client`) to prevent accidental mentions when reports are shared in GitHub issues or other platforms
- **Dependency Classification**: Packages listed in the `dependencies` section of package.json should be treated as production dependencies, regardless of whether they appear to be development tools. For example, tools like `lando` or build tools may be listed as production dependencies because they are required for the application's runtime functionality

1. **Dependency Discovery**

   - Use **semantic search** to locate dependency management files and patterns across the codebase
   - Identify all dependency management files (package.json, package-lock.json, npm-shrinkwrap.json)
   - Map direct vs transitive dependencies using `npm ls`
   - Check for lock files and version consistency
   - Review development vs production dependencies with `npm ls --production`
   - **Important**: Classify dependencies based on their package.json location (`dependencies` vs `devDependencies`), not their apparent purpose
   - Use **semantic search** to find import statements and usage patterns for dependency validation
   - Analyze dependency resolution conflicts and overrides in package.json
   - Review TypeScript type dependencies (`@types/*`) for consistency

2. **Version Analysis**

   - Check for outdated packages and available updates using `npm outdated --json`
   - Use **semantic search** to find version-specific code patterns and compatibility issues
   - Identify packages with major version updates available
   - Review semantic versioning compliance
   - Analyze version pinning strategies

3. **Security Vulnerability Scan**

   - Run security audits using appropriate tools:
     - `npm audit --json` for detailed vulnerability information in JSON format
     - `npm audit signatures` for package integrity verification
     - `npm audit fix --dry-run` to preview potential fixes
     - GitHub security advisories for all platforms
   - Use **semantic search** to identify vulnerable code patterns and usage of affected packages
   - Identify critical, high, medium, and low severity vulnerabilities
   - Check for known exploits and CVE references
   - Analyze vulnerability chains and transitive dependency risks
   - Review package signatures and authenticity

4. **License Compliance**

   - Review all dependency licenses for compatibility using `npx license-checker --summary`
   - Identify restrictive licenses (GPL, AGPL, etc.) using `npx license-checker --onlyAllow 'MIT;Apache-2.0;BSD-3-Clause'` (invert check)
   - Use **semantic search** to find license headers and copyright notices in source files
   - Check for license conflicts with project license
   - Document license obligations and requirements
   - Verify production vs development dependency license requirements

5. **Dependency Health Assessment**

   - Use **semantic search** to identify unused imports and dead code related to dependencies
   - Check package maintenance status and activity
   - Review contributor count and community support
   - Analyze release frequency and stability
   - Identify abandoned or deprecated packages

6. **Performance and Resource Impact** (CLI/Server Context)

   - Check for duplicate functionality across dependencies
   - Analyze startup time impact of dependencies for CLI tools
   - Review memory usage patterns for server applications
   - Check installation time and disk space usage with `du -sh node_modules`
   - Identify largest dependencies that may impact installation time

7. **Alternative Analysis**

   - Use **semantic search** to find similar functionality across different dependencies
   - Identify dependencies with better alternatives
   - Check for lighter or more efficient replacements
   - Analyze feature overlap and consolidation opportunities
   - Review native alternatives (built-in functions vs libraries)

8. **Dependency Conflicts**

   - Check for version conflicts between dependencies using `npm ls`
   - Identify peer dependency issues and unmet dependencies
   - Use **semantic search** to find conflicting API usage patterns between different versions
   - Review dependency resolution strategies and overrides in package.json
   - Analyze potential breaking changes in updates

9. **Build and Development Impact**

   - Use **semantic search** to identify build-related configurations and scripts
   - Review dependencies that affect build times
   - Check for development-only dependencies in production
   - Analyze tooling dependencies and alternatives
   - Review optional dependencies and their necessity

10. **Supply Chain Security**

    - Check for typosquatting and malicious packages
    - Review package authenticity and signatures
    - Analyze dependency sources and registries
    - Check for suspicious or unusual dependencies

11. **Update Strategy Planning**

    - Create a prioritized update plan based on security and stability
    - Identify breaking changes and required code modifications
    - Plan for testing strategy during updates
    - Document rollback procedures for problematic updates

12. **Monitoring and Automation**

    - Set up automated dependency scanning
    - Configure security alerts and notifications
    - Review dependency update automation tools
    - Establish regular audit schedules

13. **Documentation and Reporting**

    - Create a comprehensive dependency inventory
    - Document all security findings with remediation steps
    - Provide update recommendations with priority levels (Critical/High/Medium/Low)
    - Generate executive summary for stakeholders
    - Create actionable update strategy with phases
    - Document testing requirements for each update
    - Include rollback procedures and risk assessments

14. **Cleanup and Optimization**
    - Use **semantic search** to identify unused imports and dependencies across the codebase
    - Identify and remove unused dependencies using `npx depcheck`
    - Check for missing dependencies that should be declared
    - Review optional dependencies and their necessity
    - Optimize dependency declarations (move dev dependencies, etc.)
    - Verify production dependency isolation using `npm ls --production`
    - Clean up package.json structure and organize dependencies logically

Use Node.js/npm specific tools and databases for the most accurate results. **Prioritize semantic search** for code analysis to understand actual dependency usage patterns. Focus on actionable recommendations with clear risk assessments. For CLI and server applications, prioritize security, maintainability, and installation experience over bundle size optimization.

## Required Tools and Commands

Execute these commands as part of the audit process:

### Security Analysis

```bash
npm audit --json                    # Detailed vulnerability information
npm audit signatures                # Package integrity verification
npm audit fix --dry-run             # Preview potential security fixes
```

### Dependency Analysis

```bash
npm ls --depth=0                    # Top-level dependency tree
npm ls --omit=dev                   # Production dependencies only
npm outdated --json                 # Detailed update information
```

### Cleanup and Optimization

```bash
npx depcheck                        # Find unused dependencies
npx license-checker --summary       # License compliance overview
npx license-checker --onlyAllow 'MIT;Apache-2.0;BSD-3-Clause' --failOn 'GPL;AGPL'  # Check restrictive licenses
du -sh node_modules                 # Check installation size
du -sh node_modules/* | sort -hr | head -10  # Top 10 largest dependencies
```

## Expected Output Format

Provide a structured report with the following sections:

### Executive Summary

- Brief overview of dependency health
- Key risks and recommendations
- Priority action items

### Security Analysis

- Vulnerability count by severity
- Specific CVEs and exploitation risks
- Supply chain security concerns

### Maintenance Assessment

- Outdated packages summary
- Abandoned or deprecated dependencies
- Update complexity analysis

### Action Plan

- **Phase 1 (Immediate)**: Critical security fixes and cleanup
- **Phase 2 (Planned)**: Major version updates and improvements
- **Phase 3 (Optimization)**: Performance and alternative analysis

### Technical Details

- Use **semantic search** to analyze actual dependency usage in the codebase
- Complete dependency inventory with `npm ls --depth=0`
- License compliance matrix using `npx license-checker`
- Installation time and disk usage analysis
- Tool command outputs and evidence
- Package override analysis and security implications
- TypeScript type dependency analysis
- **Note**: All package names should be formatted in backticks (e.g., `package-name`) throughout the report

## Deliverables

1. **Console Output**: Display the complete dependency audit report directly in the chat/console
2. **Markdown File**: Create an untitled markdown file (e.g., `Dependency-Audit-Report.md`) containing the complete report for easy saving and sharing

The markdown file should be formatted identically to the console output, allowing users to save it for documentation purposes or share with team members.
