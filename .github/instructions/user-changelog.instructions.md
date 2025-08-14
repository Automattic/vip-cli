---
description: User-Facing Changelog Generation
---

# User-Facing Changelog Generation Instructions

Generate a changelog entry from the given diff or patch file.

## Audience

General users with no technical background.

## Tone & Style

- Use clear, simple, and friendly language.
- Keep entries concise and to the point.
- Use active voice and present tense.
- Avoid technical jargon, code references, function names, file paths, or internal implementation details.
- Focus on what changed _from the user’s perspective_ and how it improves or affects their experience.

## Content Guidelines

- **Only include changes that directly affect the user experience** - new features, bug fixes that users would notice, interface changes, or behavior changes
- **Exclude technical changes** like dependency updates, internal refactoring, test improvements, CI/CD changes, or developer tooling updates
- **Exclude infrastructure changes** like GitHub Actions updates, build system changes, or internal code organization
- Group related changes together if appropriate (e.g., improvements to environment setup).
- You may start with a short intro phrase (e.g., “This release includes:” or “We’ve made improvements to…”), but it’s not required.
- **When in doubt, leave it out** - if a change doesn't clearly benefit end users, it shouldn't be in a user-facing changelog

## Examples of acceptable phrasing

**Include these types of changes:**

- “Improves reliability when syncing your local database.”
- “Prevents errors when running commands in the wrong environment.”
- “Updates internal tools to ensure better performance and future compatibility.”
- “Removes outdated options to simplify the setup process.”

**Do NOT include these types of changes:**

- Dependency updates (e.g., "Updates Node.js from v18 to v20")
- Test improvements (e.g., "Adds unit tests for database module")
- CI/CD changes (e.g., "Updates GitHub Actions workflow")
- Internal refactoring (e.g., "Refactors authentication module")
- Developer tooling (e.g., "Updates ESLint configuration")

## Output Format

- Markdown
- Use a bullet list or short paragraph(s)
- Use headings to separate different categories of changes
