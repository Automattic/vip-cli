# VIP-CLI Copilot Instructions

## Repository Overview

VIP-CLI is a command-line tool for interacting with and managing WordPress VIP applications. This is a **public repository** - never include internal links, sensitive information, or credentials.

**Key Stats:**

- ~181 source files (JavaScript & TypeScript)
- ~12,400 lines of code
- Node.js CLI application
- Published to npm as `@automattic/vip`

## Build & Test Workflow

### Prerequisites

**ALWAYS check Node version compatibility:**

- Required: Node `^20.19.0 || ^22.12.0 || >=23.0.0` and npm `>=8`
- Check with: `node --version && npm --version`
- The repo uses `.nvmrc` (set to `lts/*`)

### Installation & Setup

**ALWAYS run in this exact order:**

```bash
# 1. Install dependencies (ALWAYS use npm ci, never npm install)
npm ci

# 2. The 'prepare' script runs automatically during npm ci and does:
#    - npm run clean (removes dist/)
#    - npm run build (compiles TypeScript/JS to dist/)
```

**Expected output from npm ci:**

- Will run `prepare` script automatically
- Compiles ~151 files with Babel
- Takes ~50-60 seconds
- Creates `dist/` directory with compiled code

### Build Commands

```bash
# Clean build artifacts (removes dist/)
npm run clean

# Build all source files (REQUIRED after any code changes)
npm run build
# Expected: "Successfully compiled 151 files with Babel (~1600ms)"

# Watch mode for development (includes source maps)
npm run build:watch
```

**Important:** The source code is in `src/` but all commands execute from `dist/`. You MUST run `npm run build` after making code changes.

### Validation Commands

**Run these in order before committing:**

```bash
# 1. Lint (ALWAYS run first)
npm run lint
# Uses ESLint with @automattic/eslint-plugin-wpvip
# Expected: No output = success

# 2. Type check (ALWAYS run)
npm run check-types
# Uses TypeScript compiler in noEmit mode
# Expected: No output = success

# 3. Format check (ALWAYS run)
npm run format:check
# Uses Prettier (wp-prettier@2.8.5)
# Expected: "All matched files use Prettier code style!"

# 4. Auto-fix formatting (if format:check fails)
npm run format

# 5. Run unit tests (takes ~20 seconds)
npm run jest
# Expected: "Test Suites: 46 passed, Tests: 416 passed"
# Excludes E2E tests

# 6. Full test suite (includes all checks)
npm run test
# Runs: lint + check-types + jest with coverage
# Takes ~30-40 seconds
```

**CRITICAL:** If any validation fails, fix it before committing. The CI pipeline runs these same checks.

### Testing

**Unit Tests:**

- Located in `__tests__/` directory
- Run with: `npm run jest`
- Use Jest framework
- Takes ~20 seconds
- Expected: 46 test suites, 416+ tests passing

**E2E Tests:**

- Located in `__tests__/devenv-e2e/`
- Run with: `npm run test:e2e:dev-env`
- Requires Docker and docker-compose
- Takes several minutes
- NOT run by default with `npm test`

**Windows Tests:**

- Script at `__tests__/e2e_test.bat`
- Tests CLI packaging and basic dev-env creation
- Only run in CI on Windows

### Common Build Issues & Solutions

**Issue: "Error: spawn vip-command ENOENT"**

- Cause: Commands not linked locally
- Solution: Run `npm link` after building

**Issue: Build appears to do nothing**

- Cause: `dist/` may have stale files
- Solution: Run `npm run clean && npm run build`

**Issue: Tests fail with import errors**

- Cause: Code not built or built incorrectly
- Solution: Run `npm run build` before tests

**Issue: Prettier/ESLint failures**

- Cause: Code style violations
- Solution: Run `npm run format` then `npm run lint:fix`

## GitHub Workflows & CI

**ALWAYS ensure your changes pass CI.** The following workflows run automatically:

### Main CI Workflow (`.github/workflows/ci.yml`)

Runs on: Pull requests, pushes to `develop`/`trunk`

**Jobs:**

1. **Checks** (runs in parallel):

   - Lint (`npm run lint`)
   - Type Checker (`npm run check-types`)
   - Format check (`npm run format:check`)

2. **Dependaban**: Verifies no dependencies have install scripts

3. **Audit**: Runs `npm audit signatures`

4. **Tests**: Runs unit tests on Node LTS, LTS-1, and current
   - Uses `npm run jest` (NOT full test suite)

### Other Workflows

- **DevEnv E2E** (`.github/workflows/devenv-e2e.yml`): Runs E2E tests with Docker
- **Windows Tests** (`.github/workflows/windows-tests.yml`): Runs on Windows
- **CodeQL** (`.github/workflows/codeql.yml`): Security analysis

### Pre-publish Checks

The `helpers/prepublishOnly.js` script enforces:

- Runs tests before publishing (in CI)
- Enforces branch (`trunk` for latest releases)
- Validates Node version
- Checks git working directory is clean

## Code Architecture

### Directory Structure

```
vip-cli/
├── .github/          # GitHub Actions workflows and config
├── __fixtures__/     # Test fixtures
├── __tests__/        # Unit and E2E tests
│   └── devenv-e2e/   # E2E tests for dev environments
├── config/           # Environment configs (local/publish)
├── docs/             # Documentation (ARCHITECTURE, SETUP, TESTING, etc.)
├── helpers/          # Build/release helper scripts
├── src/              # SOURCE CODE (edit here)
│   ├── bin/          # CLI entry points (vip-*.js files)
│   ├── commands/     # Command implementations
│   └── lib/          # Shared libraries
│       ├── analytics/
│       ├── api/
│       ├── cli/
│       ├── dev-environment/
│       └── ...
├── types/            # TypeScript type definitions
├── dist/             # COMPILED OUTPUT (never edit directly)
├── babel.config.js   # Babel configuration
├── jest.config.js    # Jest test configuration
├── tsconfig.json     # TypeScript configuration
└── package.json      # Dependencies and scripts
```

### Key Files

**Configuration:**

- `package.json` - Dependencies, scripts, bin commands, Node version requirement
- `babel.config.js` - Transpiles TypeScript/modern JS to Node 18+ compatible code
- `tsconfig.json` - TypeScript settings (noEmit: true, Babel handles compilation)
- `.eslintrc.js` - Extends @automattic/eslint-plugin-wpvip
- `.prettierrc` - Uses @automattic/eslint-plugin-wpvip/prettierrc
- `jest.config.js` - Test framework configuration
- `.nvmrc` - Node version hint for version managers

**Entry Points:**

- `src/bin/vip.js` - Main CLI entry point
- `src/bin/vip-*.js` - Individual command entry points (61 commands)
- All bin files defined in `package.json#bin`, output to `dist/bin/`

**Key Libraries:**

- `src/lib/cli/command.js` - Command framework
- `src/lib/cli/config.js` - CLI configuration
- `src/lib/dev-environment/` - Local dev environment management (uses Lando)
- `src/lib/api/` - API client for WPVIP API

### Adding New Commands

1. Add new command file to `src/bin/vip-<command>.js`
2. Add entry to `package.json#bin` pointing to `dist/bin/vip-<command>.js`
3. Run `npm run build`
4. Run `npm link` so arg knows how to spawn the command
5. Add tests to `__tests__/bin/`

### Coding Standards

**Language Choice:**

- **Use TypeScript for all new code** (files with `.ts` extension)
- Existing `.js` files can remain JavaScript

**Style:**

- Enforced by ESLint (@automattic/eslint-plugin-wpvip)
- Formatted by Prettier
- Use `npm run lint:fix` and `npm run format` to auto-fix

**TypeScript Configuration:**

- `target: "ES2022"`, `module: "nodenext"`
- `noEmit: true` - Babel handles compilation
- `strict: true`
- Types in `types/` directory for external modules

## Dependencies & External Services

### External APIs

**WPVIP API:**

- Primary endpoint: `https://api.wpvip.com`
- Requires authentication token from `https://dashboard.wpvip.com/me/cli/token`
- Token stored securely via keychain (or configstore as fallback)

**Analytics:**

- Endpoint: `https://public-api.wordpress.com/rest`
- Can be disabled with `DO_NOT_TRACK=1` environment variable

### Key Dependencies

**Runtime:**

- `lando` - Local development environment (forked version from Automattic)
- `@automattic/vip-search-replace` - Database search/replace
- `apollo/client` - GraphQL API client
- `chalk` - Terminal colors
- `enquirer` - Interactive prompts
- `args` - Command-line argument parsing

**Development:**

- `babel` - Transpiles TS/JS to Node-compatible code
- `typescript` - Type checking only (noEmit: true)
- `jest` - Testing framework
- `eslint` - Linting
- `prettier` - Code formatting

### Docker Requirements

**For dev-env commands only:**

- Docker engine must be running
- docker-compose required (plugin or standalone)
- Validated by `src/lib/dev-environment/dev-environment-lando.ts`

## Environment Variables

**Common:**

- `DO_NOT_TRACK` - Disable analytics (set to `1`)
- `DEBUG` - Enable debug output (e.g., `DEBUG=@automattic/vip:*`)
- `NODE_OPTIONS` - Node.js runtime options

**For Testing/Development:**

- `API_HOST` - Override API endpoint (internal use)
- `VIP_PROXY` - Proxy configuration (internal use)
- `WPVIP_DEPLOY_TOKEN` - Deploy token for custom deploys

**Docker:**

- `DOCKER_HOST`, `DOCKER_CERT_PATH`, `DOCKER_TLS_VERIFY`
- `DOCKER_CLIENT_TIMEOUT`

## Development Workflow

### Making Code Changes

1. **Create feature branch** from `trunk`:

   ```bash
   git checkout trunk
   git pull
   git checkout -b add/your-feature-name
   ```

2. **Make changes in `src/`** (never edit `dist/` directly)

3. **Build and test iteratively:**

   ```bash
   npm run build          # Rebuild after changes
   npm run lint           # Check code style
   npm run check-types    # Check TypeScript
   npm run jest           # Run tests
   ```

4. **Test locally** (if applicable):

   ```bash
   npm link               # Link local version globally
   vip <your-command>     # Test your changes
   ```

5. **Before committing:**

   ```bash
   npm run format         # Auto-fix formatting
   npm run lint:fix       # Auto-fix linting issues
   npm run test           # Run full validation
   ```

6. **Commit and push:**
   ```bash
   git add .
   git commit -m "type(scope): description"
   git push origin add/your-feature-name
   ```

### Debugging

**Using Node Inspector:**

1. Run `npm run build:watch` (includes source maps)
2. Run with debugger: `node --inspect ./dist/bin/vip-<command>.js`
3. Note the debugger port (usually 9229)
4. Attach debugger from your IDE
5. Set breakpoints and debug

**Debug Output:**

- Set `DEBUG=@automattic/vip:*` to enable all debug logs
- Or specific module: `DEBUG=@automattic/vip:bin:dev-environment`

## Common Pitfalls & Gotchas

1. **ALWAYS run `npm ci`, never `npm install`**

   - `npm ci` ensures consistent dependencies from shrinkwrap
   - Faster and more reliable

2. **ALWAYS build before testing**

   - Tests run against `dist/`, not `src/`
   - Run `npm run build` after ANY code change

3. **Don't edit `dist/` directly**

   - It's auto-generated and git-ignored
   - Edit `src/` and rebuild

4. **Use TypeScript for new code**

   - Project is migrating from JS to TS
   - Add `.ts` extension, not `.js`

5. **Run `npm link` after adding new commands**

   - Required for local command spawning
   - Skip this = "Error: spawn vip-command ENOENT"

6. **Check Node version compatibility**

   - Use nvm or nodenv to match `.nvmrc`
   - CI uses LTS (currently Node 20.x)

7. **Never include internal/sensitive info**

   - This is a PUBLIC repository
   - No internal links in PRs or commits

8. **Test on clean state**

   - Run `npm run clean && npm run build` if unsure
   - Clears stale build artifacts

9. **Windows line endings**

   - CI enforces LF line endings
   - Configure git: `git config core.autocrlf false`

10. **Format before committing**
    - CI will fail on formatting issues
    - Run `npm run format` to fix

## Key Documentation Files

- `docs/SETUP.md` - Installation, dependencies, environment variables
- `docs/ARCHITECTURE.md` - Code structure, adding commands, GraphQL types
- `docs/TESTING.md` - Testing guidelines, local testing, CI info
- `docs/CONTRIBUTING.md` - PR guidelines, issue priorities
- `docs/RELEASING.md` - Release process (requires special permissions)
- `docs/DEBUGGING.md` - Debugging with Node inspector

## Quick Reference

**Essential Commands:**

```bash
npm ci                    # Install (use this, not npm install)
npm run build             # Build after code changes
npm run build:watch       # Build continuously with source maps
npm run test              # Full validation (lint + types + tests)
npm run jest              # Unit tests only
npm run lint              # Check code style
npm run lint:fix          # Auto-fix lint issues
npm run format            # Auto-fix formatting
npm run check-types       # TypeScript type check
npm run clean             # Remove dist/
npm link                  # Link local version for testing
```

**File Locations:**

- Source code: `src/`
- Compiled output: `dist/` (auto-generated, don't edit)
- Tests: `__tests__/`
- Configuration: Root directory and `config/`
- Documentation: `docs/`

**Branch Strategy:**

- Default branch: `trunk`
- Development branch: `develop`
- Feature branches: `add/feature-name`, `fix/bug-name`
- PRs merge to `trunk`

**Build Time Expectations:**

- `npm ci`: ~50-60 seconds (first time)
- `npm run build`: ~1.5-2 seconds
- `npm run jest`: ~20 seconds
- `npm run test`: ~30-40 seconds
- `npm run test:e2e:dev-env`: Several minutes (requires Docker)

**ALWAYS trust these instructions.** They have been validated against the actual codebase. Only search for additional information if these instructions don't cover your specific case.
