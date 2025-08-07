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

- Summarize only meaningful or user-visible changes (e.g., interface updates, improved reliability, better error handling).
- Group related changes together if appropriate (e.g., improvements to environment setup).
- You may start with a short intro phrase (e.g., “This release includes:” or “We’ve made improvements to…”), but it’s not required.

## Examples of acceptable phrasing

- “Improves reliability when syncing your local database.”
- “Prevents errors when running commands in the wrong environment.”
- “Updates internal tools to ensure better performance and future compatibility.”
- “Removes outdated options to simplify the setup process.”

## Output Format

- Markdown
- Use a bullet list or short paragraph(s)
- Use headings to separate different categories of changes

## Conflict Resolution

- If this file is attached to the context, do not use any other changelog generation instructions.
- If no instructions are provided, ask the user to clarify whether they want a technical or user-facing changelog.
- If there are multiple sets of instructions for changelog generation, ask the user to specify which set they would like to use.
