<div align="center">

# Chrona ⚡

**The Typechecker and Compiler for Documentation.** 

[![npm version](https://img.shields.io/npm/v/@chrona-engine/cli.svg?color=blue&style=flat-square)](https://www.npmjs.com/package/@chrona-engine/cli)
[![license](https://img.shields.io/npm/l/@chrona-engine/cli.svg?style=flat-square)](https://github.com/sicario-labs/chrona/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-218%20passing-brightgreen.svg?style=flat-square)](https://github.com/sicario-labs/chrona)

*Docs that never go stale.*

</div>

---

## ⚡ The Problem: Documentation Rots Quickly

Linters check your syntax. Compilers check your types. But nothing checks your documentation. Documentation and AI coding agents constantly hallucinate stale APIs, deleted parameters, and renamed methods.

**Chrona is the typechecker for your docs.** It reads your `.md` and `.mdx` files, cross-references them against your actual codebase AST, and spots contradictions immediately.

```text
Docs (MDX) + Codebase (AST) 
    ↓
Chrona Typechecker
    ↓
"Error: timeout parameter no longer exists in createClient()"
```

---

## 🚀 Instant Onboarding

Zero-config setup. Keep your MDX/MD files in a dedicated `content/docs` or `docs/` folder.

```bash
# 1. Initialize your docs folder and Fumadocs engine
npx @chrona-engine/cli init

# 2. Type-check your documentation against live codebase AST
npx @chrona-engine/cli check

# 3. Start the dev server (Beautiful Fumadocs UI out of the box)
npx @chrona-engine/cli dev
```

---

## 🎨 Fumadocs & 🌍 Vercel Deployment

We leverage the incredible **[Fumadocs](https://fumadocs.vercel.app/)** framework under the hood. When you run `chrona dev` or `chrona build`, you get a stunning, high-performance documentation site immediately—complete with full-text search, dark mode, callouts, and code highlighting.

**Immediate Free Deployment:**
Chrona sites can be instantly deployed to Vercel for free.

```bash
# Deploy instantly to Vercel
npx @chrona-engine/cli deploy --vercel
```

Or self-host anywhere (Cloudflare, AWS, Netlify) using the static export from `chrona build`.

---

## 🛠️ The Compiler Commands

| Command | Purpose |
|---|---|
| `chrona init` | Scaffold docs folder & configuration |
| `chrona check` | The Docs Typechecker (Fail CI on stale docs) |
| `chrona dev` | Local Fumadocs dev server |
| `chrona build` | Compile static production docs & `llms.txt` |
| `chrona deploy` | 1-Click deploy to Vercel |

---

## 📄 License

MIT © [Emmanuel Enyi](https://github.com/sicario-labs) / [Sicario Labs](https://github.com/sicario-labs)
