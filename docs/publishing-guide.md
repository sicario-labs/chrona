# Chrona NPM Publishing & Release Guide

This guide walks you step-by-step through publishing `@chrona-engine/cli` and `@chrona/engine` to the public npm registry.

---

## 1. Prerequisites

### A. NPM Account & Organization Setup
Ensure you have an account at [npmjs.com](https://www.npmjs.com) and that you are logged into your terminal:

```bash
# Verify your logged-in user
npm whoami

# If not logged in, authenticate:
npm login
```

*(If you have 2FA enabled, npm will prompt you for an OTP or open your browser for web authentication).*

---

## 2. Pre-Publish Validation Checklist

Before publishing, ensure the entire monorepo is built and 100% verified:

```bash
# 1. Clean build across all packages
pnpm build

# 2. Run all 131 tests
pnpm test --run

# 3. Type-check across all packages
pnpm types:check

# 4. Lint check
pnpm lint
```

---

## 3. Publishing the Packages

Because this is a pnpm monorepo with scoped packages under your organization (`@chrona-engine/cli`, `@chrona-engine/engine`, and `@chrona-engine/api`), publish with the `--access public` flag:

### Option A: Publish All Packages Simultaneously via pnpm (Recommended)
```bash
# From the repository root:
pnpm -r publish --access public --no-git-checks
```

### Option B: Publish Packages Individually

#### 1. Publish `@chrona-engine/engine` first (as `@chrona-engine/cli` depends on it):
```bash
cd packages/engine
npm publish --access public
```

#### 2. Publish `@chrona-engine/cli`:
```bash
cd ../cli
npm publish --access public
```

---

## 4. Verifying the Published Release

Once published, verify that npm resolves the package and binary:

```bash
# 1. Test running with npx in any terminal:
npx @chrona-engine/cli --version
npx @chrona-engine/cli ws

# 2. Test global install:
npm install -g @chrona-engine/cli
chrona --version
chrona explain createRouter
```

---

## 5. Releasing New Versions (Automated Version Bumps)

When preparing future releases:

```bash
# 1. Bump version in packages/cli/package.json (e.g. 1.4.3)
# 2. Rebuild
pnpm build

# 3. Publish
pnpm -r publish --access public
```
