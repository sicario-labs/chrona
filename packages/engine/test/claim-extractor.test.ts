import { describe, expect, it } from 'vitest';
import { ClaimExtractor } from '../src/claim/extractor';

describe('ClaimExtractor', () => {
  const extractor = new ClaimExtractor();

  it('extracts symbol claims from imports, recipes, and headings', () => {
    const mdx = `
# Getting Started

import { createRouter, findRoute } from 'radix3';

<Recipe
  title="Route Dispatcher"
  uses={["createRouter", "routesOverlap"]}
>
  \`\`\`ts
  const router = createRouter();
  \`\`\`
</Recipe>

### \`parseURL\`
Parses a URL string.
`;

    const claims = extractor.extractClaims(mdx, 'content/docs/router.mdx');
    const symbolClaims = claims.filter((c) => c.type === 'symbol');

    const subjects = symbolClaims.map((c) => c.subject);
    expect(subjects).toContain('createRouter');
    expect(subjects).toContain('findRoute');
    expect(subjects).toContain('routesOverlap');
    expect(subjects).toContain('parseURL');
  });

  it('extracts signature and return type claims from heading declarations', () => {
    const mdx = `
### \`indexProject(options?: IndexOptions): Promise<RepositoryIndex>\`

Indexes all exported symbols across a workspace.
`;

    const claims = extractor.extractClaims(mdx, 'content/docs/api.mdx');
    const sigClaim = claims.find((c) => c.type === 'signature');
    expect(sigClaim).toBeDefined();
    expect(sigClaim?.subject).toBe('indexProject');
    expect(sigClaim?.metadata?.returnType).toBe('Promise<RepositoryIndex>');

    const returnClaim = claims.find((c) => c.type === 'return');
    expect(returnClaim).toBeDefined();
    expect(returnClaim?.subject).toBe('indexProject');
    expect(returnClaim?.metadata?.claimedReturnType).toBe('Promise<RepositoryIndex>');
  });

  it('extracts parameter claims from calls, ParamField components, and lists', () => {
    const mdx = `
# Routing

\`createRouter({ strict: true })\`

<ParamField path="options.trailingSlash" type="boolean" default="false">
  Enforce trailing slashes.
</ParamField>

#### Parameters:
- \`options.tsconfigPath\` (\`string\`, optional): Path to tsconfig.
`;

    const claims = extractor.extractClaims(mdx, 'content/docs/routing.mdx');
    const paramClaims = claims.filter((c) => c.type === 'parameter');

    expect(paramClaims.length).toBeGreaterThanOrEqual(3);
    const callParam = paramClaims.find((c) => c.metadata?.origin === 'object-argument');
    expect(callParam?.subject).toBe('createRouter');
    expect(callParam?.metadata?.keys).toContain('strict');

    const paramField = paramClaims.find((c) => c.metadata?.origin === 'param-field');
    expect(paramField?.metadata?.paramName).toBe('trailingSlash');

    const listParam = paramClaims.find((c) => c.metadata?.origin === 'parameter-list');
    expect(listParam?.metadata?.paramName).toBe('tsconfigPath');
  });

  it('extracts fenced code block examples with metadata', () => {
    const mdx = `
\`\`\`ts title="Basic Example"
import { parseURL } from 'radix3';
const url = parseURL("https://example.com");
\`\`\`
`;

    const claims = extractor.extractClaims(mdx, 'content/docs/example.mdx');
    const exampleClaim = claims.find((c) => c.type === 'example');

    expect(exampleClaim).toBeDefined();
    expect(exampleClaim?.metadata?.language).toBe('ts');
    expect(exampleClaim?.subject).toBe('Basic Example');
    expect(exampleClaim?.metadata?.code).toContain('parseURL');
  });
});
