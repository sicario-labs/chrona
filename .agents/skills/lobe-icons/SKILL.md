---
name: lobe-icons
description: Use `@lobehub/icons` — a collection of 200+ AI/LLM brand SVG logos and icon React components. Covers installation, React component usage (with variants like Color, Brand, Text, Combine, Avatar), CDN URL generation for static assets (SVG/PNG/WebP), helper components (ModelIcon, ProviderIcon, ProviderCombine), the icon table-of-contents metadata, and custom icon creation via IconType. Use when working with AI brand logos, model provider icons, or needing icon assets in any format.
---

# Lobe Icons

200+ AI / LLM brand SVG logo and icon collection as React components with CDN static asset support.

- **Package**: `@lobehub/icons`
- **Browse all icons**: [lobehub.com/icons](https://lobehub.com/icons)
- **Component docs**: [icons.lobehub.com](https://icons.lobehub.com)
- **GitHub**: [github.com/lobehub/lobe-icons](https://github.com/lobehub/lobe-icons)

## Installation

```bash
pnpm add @lobehub/icons
# or
npm install @lobehub/icons
```

## React Components

Each icon exports a base component and variant sub-components:

```tsx
import { OpenAI, Claude, Google, Meta, DeepSeek } from '@lobehub/icons';

// Base (mono)
<OpenAI size={24} />

// Variants (availability depends on icon, check `param` flags in toc)
<OpenAI.Color size={24} />       // hasColor
<OpenAI.Brand size={24} />       // hasBrand
<OpenAI.BrandColor size={24} />  // hasBrandColor
<OpenAI.Text size={32} />        // hasText
<OpenAI.TextCn size={32} />      // hasTextCn
<OpenAI.TextColor size={32} />   // hasTextColor
<OpenAI.Combine size={64} />     // hasCombine
<OpenAI.Combine size={64} type="color" />  // hasCombine (color variant)
<OpenAI.Avatar size={64} />      // hasAvatar
```

Common props: `size`, `style`, `className`.

### Available Icon Names

Icons are exported by PascalCase id. Examples: `OpenAI`, `Claude`, `DeepSeek`, `Google`, `Aws`, `Bedrock`, `Microsoft`, `LobeHub`, `Github`, `Anthropic`, `Gemini`, `Meta`, `Mistral`, `Perplexity`, `Cohere`, `Zhipu`, `ByteDance`, `AlibabaCloud`, etc.

For the full list, see [reference/providers.md](reference/providers.md).

## Helper Components

### ModelIcon — Render icon by model ID string

```tsx
import { ModelIcon } from '@lobehub/icons';

<ModelIcon model="gpt-4o" size={24} />
<ModelIcon model="claude-3-opus" size={24} />
```

### ProviderIcon — Render icon by provider key

```tsx
import { ProviderIcon } from '@lobehub/icons';

<ProviderIcon provider="openai" size={28} type="mono" />
<ProviderIcon provider="anthropic" size={28} type="color" />
```

### ProviderCombine — Logo + text combined

```tsx
import { ProviderCombine, ModelProvider } from '@lobehub/icons';

<ProviderCombine provider={ModelProvider.OpenAI} size={32} type="mono" />
<ProviderCombine provider="anthropic" size={32} type="color" />
```

### ModelProvider enum

```tsx
import { ModelProvider } from '@lobehub/icons';

ModelProvider.OpenAI; // "openai"
ModelProvider.Anthropic; // "anthropic"
ModelProvider.Google; // "google"
ModelProvider.DeepSeek; // "deepseek"
// ... 130+ providers
```

## CDN URLs (Static Assets)

Use `getLobeIconCDN` to generate direct URLs to icon images without React:

```tsx
import { getLobeIconCDN } from '@lobehub/icons';

// Default: PNG, light mode, color variant, GitHub CDN
getLobeIconCDN('openai');
// → https://raw.githubusercontent.com/.../light/openai-color.png

getLobeIconCDN('openai', {
  format: 'svg', // 'svg' | 'png' | 'webp' | 'avatar'
  type: 'mono', // 'mono' | 'color' | 'text' | 'text-cn' | 'brand' | 'brand-color'
  isDarkMode: true, // affects PNG/WebP path (dark/ vs light/)
  cdn: 'aliyun', // 'github' (default) | 'aliyun' | 'unpkg'
});
```

### CDN URL Patterns

**SVG** (no light/dark distinction):

```
# GitHub
https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/{id}.svg
https://raw.githubusercontent.com/.../icons/{id}-color.svg
https://raw.githubusercontent.com/.../icons/{id}-text.svg

# unpkg
https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
```
