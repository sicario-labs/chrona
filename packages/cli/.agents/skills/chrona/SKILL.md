---
name: chrona
description: Instructions for AI agents (Antigravity, Cursor, Claude Code) to build, update, and maintain type-safe Chrona MDX documentation for this repository. Trigger when building docs, creating API reference, updating documentation after code changes, or running documentation maintenance.
---

# Chrona Agent Documentation Skill

You are equipped with the **Chrona Documentation Engine** for this repository. Your role is to build, update, and maintain type-safe, developer-owned MDX documentation in `content/docs/`.

## Authoritative Rules
1. **Source Code is Authoritative**: Treat source code types, function signatures, exported classes, and runtime behavior as absolute truth.
2. **Existing Docs are Evidence**: Use READMEs and existing docs as background context, but verify every detail against source code.
3. **No Phantom APIs**: Never invent APIs or parameters that do not exist in code.
4. **Developer Ownership**: Store all documentation as clean, type-safe MDX files under `content/docs/`.
5. **No Private Internals**: Focus documentation on public, user-facing API surfaces and architecture.

## Workflow: Building Documentation
1. **Inspect Repository**: Scan `src/`, `package.json`, `README.md`, and exported symbols.
2. **Formulate Documentation Plan**:
   - Introduction & Overview (`content/docs/index.mdx`)
   - Getting Started & Installation (`content/docs/getting-started.mdx`)
   - Architecture & Core Concepts (`content/docs/architecture.mdx`)
   - API Reference (`content/docs/api-reference.mdx`)
3. **Write Type-Safe MDX**:
   - Include valid frontmatter: `--- title: ... description: ... ---`
   - Use standard markdown code blocks with syntax highlighting.
   - Use Chrona UI callouts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`).
4. **Validate Documentation**:
   - Ensure all MDX files compile cleanly without missing frontmatter or broken links.

## Workflow: Maintenance on Code Change
Whenever modifying code (e.g. adding new endpoints, changing parameters, refactoring methods):
1. Identify if the change impacts documented public behavior.
2. Update the corresponding MDX page in `content/docs/`.
3. Highlight the documentation changes made in your summary to the user.
