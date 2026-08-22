import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateAgentMcpConfig,
  installAgentMcpConfig,
} from '../src/mcp/config-generator';

describe('Universal Multi-Agent MCP Configuration Generator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrona-mcp-gen-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('generates Antigravity / AGY config in .agents/mcp_config.json', () => {
    const configs = generateAgentMcpConfig('antigravity', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].targetPath).toContain('.agents');
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.mcpServers.chrona).toBeDefined();
    expect(parsed.mcpServers.chrona.command).toBe('npx');
  });

  it('generates Claude Code config with CLI command', () => {
    const configs = generateAgentMcpConfig('claude', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].cliCommand).toContain('claude mcp add');
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.mcpServers.chrona).toBeDefined();
  });

  it('generates Cursor config in .cursor/mcp.json', () => {
    const configs = generateAgentMcpConfig('cursor', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].targetPath).toContain('.cursor');
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.mcpServers.chrona).toBeDefined();
  });

  it('generates Zed config with context_servers key', () => {
    const configs = generateAgentMcpConfig('zed', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.context_servers.chrona).toBeDefined();
  });

  it('generates Continue.dev config in YAML format', () => {
    const configs = generateAgentMcpConfig('continue', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].content).toContain('mcpServers:');
    expect(configs[0].content).toContain('- name: chrona');
  });

  it('generates Goose config with extensions and cmd properties', () => {
    const configs = generateAgentMcpConfig('goose', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].content).toContain('extensions:');
    expect(configs[0].content).toContain('cmd: npx');
    expect(configs[0].content).toContain('type: stdio');
  });

  it('generates Kiro IDE config with autoApprove permissions', () => {
    const configs = generateAgentMcpConfig('kiro', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.mcpServers.chrona.autoApprove).toContain('verify_documentation_claim');
  });

  it('generates Kilo Code config with top-level mcp key and array command', () => {
    const configs = generateAgentMcpConfig('kilo', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].content).toContain('"mcp":');
    expect(configs[0].content).toContain('"type": "local"');
  });

  it('generates OpenCode config with tool permission policies', () => {
    const configs = generateAgentMcpConfig('opencode', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    const parsed = JSON.parse(configs[0].content);
    expect(parsed.mcp.chrona.permission.tools.verify_documentation_claim).toBe('allow');
  });

  it('generates DeepSeek Harness Cordis patch layer', () => {
    const configs = generateAgentMcpConfig('deepseek', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    expect(configs[0].content).toContain('- insert:');
    expect(configs[0].content).toContain('@deepseek-ai/dsh-mcp-client');
  });

  it('generates OpenAI Codex function definitions', () => {
    const configs = generateAgentMcpConfig('codex', { cwd: tempDir });
    expect(configs).toHaveLength(1);
    const parsed = JSON.parse(configs[0].content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].function.name).toBe('verify_documentation_claim');
  });

  it('installs all configurations to target directory with installAgentMcpConfig', async () => {
    const installed = await installAgentMcpConfig('all', { cwd: tempDir });
    expect(installed.length).toBeGreaterThanOrEqual(15);

    // Verify key files were created on disk
    const agentsConfig = path.join(tempDir, '.agents/mcp_config.json');
    const cursorConfig = path.join(tempDir, '.cursor/mcp.json');
    const opencodeConfig = path.join(tempDir, 'opencode.json');
    const cordisConfig = path.join(tempDir, 'cordis.patch.yml');

    expect(await fs.stat(agentsConfig).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.stat(cursorConfig).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.stat(opencodeConfig).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.stat(cordisConfig).then(() => true).catch(() => false)).toBe(true);
  });
});
