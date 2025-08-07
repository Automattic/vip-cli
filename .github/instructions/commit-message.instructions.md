---
applyTo: "**"
description: Commit Message Instructions for AI Assistant
---

Only use the instructions in this file when explicitly asked to generate **commit messages**.  
Ignore this file for changelog generation, summaries, or code explanations.

# Commit Messages

Always generate commit messages using the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Format

```
<type>(<scope>): short summary

(optional body)

(optional footer)
```

  * Use the **imperative mood** (e.g. "add", not "added").
  * **REQUIRED**: Keep the summary under 72 characters.
  * Add a `BREAKING CHANGE:` footer if applicable.
  * Add issue references in the footer (e.g., `Fixes #123`).

## Allowed Types

  * `feat`: for new features
  * `fix`: for bug fixes
  * `docs`: for documentation only
  * `style`: for formatting, whitespace, etc. (no code changes)
  * `refactor`: for code restructuring (no behavior change)
  * `perf`: for performance improvements
  * `test`: for adding or modifying tests
  * `chore`: for maintenance tasks (e.g., dependency bumps)
  * `build`: for build system/config changes
  * `ci`: for changes to CI/CD workflows

## Recommended Scopes

### 🔧 Dependencies

| Context                             | Scope        |
|-------------------------------------|--------------|
| Runtime dependencies (axios, lodash)| `deps`       |
| Dev dependencies (eslint, jest)     | `dev-deps`   |
| Build tools (webpack, vite, babel)  | `vite`, `webpack`, `babel` |
| Lock files                          | `lockfile`   |

### ⚙ Build & CI

| Context                             | Scope        |
|-------------------------------------|--------------|
| Webpack config                      | `webpack`    |
| Vite config                         | `vite`       |
| Dockerfiles                         | `docker`     |
| GitHub Actions                      | `actions`    |
| Any `.github/workflows/*.yml`       | `workflow`   |
| CI config (CircleCI, Travis, etc.)  | `ci`, `circleci`, `travis` |

### 🧪 Testing

| Context                             | Scope        |
|-------------------------------------|--------------|
| Unit tests                          | `unit`       |
| Integration tests                   | `integration`|
| End-to-end tests                    | `e2e`        |
| Mocks, fixtures                     | `fixtures`   |

## Examples

```text
feat(auth): add login via OAuth
fix(api): handle 500 errors on user lookup
docs(readme): add installation instructions
chore(deps): bump axios to 1.6.2
ci(actions): update checkout to v4
build(vite): migrate to plugin-based setup
test(e2e): add login smoke tests
```

## Breaking Changes

If a commit introduces a breaking change, include a footer like this:

```
BREAKING CHANGE: removed support for legacy token format
```

## Commit Body Guidelines

### 🔒 The commit body is required

Always include a body in commit messages. The body must explain the **reasoning** behind the change.

The commit body must follow a clear, structured format using section headers, as shown below:

---

#### Purpose and Context

Explain what problem this change addresses or what feature it implements.  
Mention any relevant background, motivation, or related issues.

#### Key Changes

List the most important code-level changes, such as new functions, refactored components, or deleted code.  
Include changes in configuration, dependencies, or APIs.

#### Impact and Considerations

Note any impact on system behavior, performance, security, compatibility, or user experience.  
Mention whether database migrations, configuration changes, or special deployment steps are required.

#### Testing and Validation

Describe what tests were added or updated.  
Describe any manual testing steps performed or still required.

---

The body should:

  * Explain **why** the change was made (not how — that’s in the diff).
  * Include any **context, motivation, or rationale**.
  * Describe **side effects**, **limitations**, or **relevant decisions**.

For trivial changes (e.g. formatting only), a simple one-liner like “No functional changes.” is acceptable.

### Formatting Rules

  * Separate the summary and body with a blank line.
  * Wrap lines at ~72 characters.
  * Use full sentences in the present tense.
  * Include a `BREAKING CHANGE:` footer if needed.

### Style Notes:
  * Write concisely but with technical clarity.
  * Use professional, neutral tone—avoid vague or overly general statements.
  * Format as Markdown with clear sections and lists.

### Examples

```text
feat(auth): remove legacy token-based login

We no longer support legacy token-based login flows. This simplifies
session validation and improves security posture. OAuth2 has been the
default for 2 versions and usage of tokens is now below 1%.

BREAKING CHANGE: token-based login is no longer supported
```

```text
fix(session): prevent crash on empty token

A recent change caused `getSessionToken()` to return `undefined`
in some edge cases. This led to a crash during token parsing.
```

```text
chore(workflow): remove redundant Node.js setup

The default GitHub Actions runner already includes Node.js, so the
manual `setup-node` step is no longer needed.
```

## Code Removal Guidelines

When removing code, follow these conventions:

| Context                             | Type         | Scope Example              | Commit Example |
|-------------------------------------|--------------|-----------------------------|----------------|
| Removing unused or dead code        | `chore`      | `core`, `utils`, `api`      | `chore(core): remove unused helpers` |
| Removing deprecated functionality   | `refactor` or `chore` | `api`, `auth`         | `refactor(api): remove deprecated v1 endpoints` |
| Removing functionality as a breaking change | `feat` + `BREAKING CHANGE` | `core`, `auth` | `feat(auth): remove legacy session logic` + `BREAKING CHANGE:` |
| Removing test code                  | `test`       | `unit`, `e2e`, `integration`| `test(unit): remove duplicate tests` |
| Removing CI or build config         | `ci` or `build` | `workflow`, `actions`, `vite` | `ci(workflow): remove obsolete step` |

### Examples

```text
chore(utils): remove unused slugify helper
refactor(api): remove deprecated v1 endpoints
feat(auth): remove legacy session tokens
BREAKING CHANGE: session tokens are no longer supported
test(e2e): remove login flow edge-case test
ci(actions): remove redundant node setup
```
