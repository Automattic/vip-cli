---
description: Technical Changelog Generation
---

# Technical Changelog Generation Instructions

Generate a changelog entry from the given diff or patch file.

The changelog should be structured, clear, and suitable for a technical audience such as developers or engineers.

## Style and format requirements

- Start with a high-level summary or section title (e.g., "Key updates in this release include:").
- Group changes into logical categories (e.g., Environment and Command Improvements, Dependency Upgrades).
- Use bullet points under each category.
- Be concise, but include enough detail to understand the purpose and impact of each change.
- It’s okay to mention specific functions or component names where relevant.
- Mention deprecated options or removed functionality clearly.
- Mention updated versions of dependencies and packages.
- Ignore commits like "New develop release" or "New package release" or "Update changelog" as they do not contain meaningful changes.

## Limitations

- Do not include changes that are not relevant to the technical audience, such as documentation updates or minor fixes that do not affect functionality.
- Avoid overly technical jargon that may not be understood by all developers.
- Do not update any files, output the generated changelog to the chat.

## Notes

- Use the provided diff or patch file to identify changes.
- Focus on the code changes, especially those that affect functionality, performance, or user experience.
- If a change is not clear, provide a brief explanation based on the context of the code.
- If the diff is empty or contains no relevant changes, indicate that no significant changes were made.
- Ignore lock files (like `package-lock.json` or `yarn.lock`) and other non-code files.

## Output Format

- Markdown
- Use a bullet list or short paragraph(s)
- Use headings to separate different categories of changes

## Conflict Resolution

- If this file is attached to the context, do not use any other changelog generation instructions.
- If no instructions are provided, ask the user to clarify whether they want a technical or user-facing changelog.
- If there are multiple sets of instructions for changelog generation, ask the user to specify which set they would like to use.
