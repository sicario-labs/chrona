import { describe, it, expect } from 'vitest';
import { runChronaBadge } from '../src/commands/badge';

describe('Chrona Badge CLI Command', () => {
  it('generates markdown badge snippet with default parameters', () => {
    const md = runChronaBadge({ org: 'chronadocs', repo: 'truth-engine' });
    expect(md).toBe('[![Chrona Verified](https://api.chronadocs.xyz/badges/chronadocs/truth-engine/status.svg)](https://chronadocs.xyz/chronadocs/truth-engine)');
  });

  it('generates HTML format snippet when requested', () => {
    const html = runChronaBadge({
      org: 'chronadocs',
      repo: 'truth-engine',
      format: 'html',
    });
    expect(html).toContain('<img src="https://api.chronadocs.xyz/badges/chronadocs/truth-engine/status.svg" alt="Chrona Verified" />');
  });

  it('generates URL format with custom label query parameter', () => {
    const url = runChronaBadge({
      org: 'my-org',
      repo: 'my-repo',
      label: 'doc truth',
      format: 'url',
    });
    expect(url).toBe('https://api.chronadocs.xyz/badges/my-org/my-repo/status.svg?label=doc%20truth');
  });
});
