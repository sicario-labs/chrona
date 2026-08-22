import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';

export type AgentPlatform =
  | 'all'
  | 'antigravity'
  | 'agy'
  | 'claude'
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'continue'
  | 'jetbrains'
  | 'junie'
  | 'goose'
  | 'librechat'
  | 'cody'
  | 'sourcegraph'
  | 'kiro'
  | 'kilo'
  | 'command-code'
  | 'cline'
  | 'roo'
  | 'roo-code'
  | 'opencode'
  | 'qoder'
  | 'mimo'
  | 'mimo-code'
  | 'deepseek'
  | 'dsh'
  | 'codex'
  | 'openai';

export interface GeneratedConfig {
  platform: AgentPlatform;
  targetPath: string;
  content: string;
  cliCommand?: string;
  instructions?: string;
}

export interface GeneratorOptions {
  cwd?: string;
  scope?: 'project' | 'user';
  command?: string;
  args?: string[];
}

/**
 * Universal Multi-Agent MCP Configuration Generator
 */
export function generateAgentMcpConfig(
  platform: AgentPlatform,
  options: GeneratorOptions = {}
): GeneratedConfig[] {
  const cwd = options.cwd || process.cwd();
  const cmd = options.command || 'npx';
  const args = options.args || ['-y', 'chrona', 'mcp'];

  const configs: GeneratedConfig[] = [];

  const addStdioServer = (plat: AgentPlatform, relPath: string, extra: Record<string, unknown> = {}) => {
    configs.push({
      platform: plat,
      targetPath: path.resolve(cwd, relPath),
      content: JSON.stringify(
        {
          mcpServers: {
            chrona: {
              command: cmd,
              args,
              env: {},
              ...extra,
            },
          },
        },
        null,
        2
      ),
    });
  };

  switch (platform) {
    case 'antigravity':
    case 'agy': {
      addStdioServer(platform, '.agents/mcp_config.json');
      break;
    }

    case 'claude':
    case 'claude-code': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, '.mcp.json'),
        content: JSON.stringify(
          {
            mcpServers: {
              chrona: {
                command: cmd,
                args,
              },
            },
          },
          null,
          2
        ),
        cliCommand: `claude mcp add --transport stdio chrona -- ${cmd} ${args.join(' ')}`,
      });
      break;
    }

    case 'cursor': {
      addStdioServer(platform, '.cursor/mcp.json');
      break;
    }

    case 'windsurf': {
      addStdioServer(platform, '.windsurf/mcp_config.json');
      break;
    }

    case 'zed': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, '.zed/settings.json'),
        content: JSON.stringify(
          {
            context_servers: {
              chrona: {
                command: cmd,
                args,
                env: {},
              },
            },
          },
          null,
          2
        ),
      });
      break;
    }

    case 'continue': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, '.continue/config.yaml'),
        content: [
          'mcpServers:',
          '  - name: chrona',
          `    command: ${cmd}`,
          '    args:',
          ...args.map((a) => `      - "${a}"`),
          '    env: {}',
        ].join('\n'),
      });
      break;
    }

    case 'jetbrains':
    case 'junie': {
      addStdioServer(platform, '.idea/mcp.json');
      break;
    }

    case 'goose': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, '.config/goose/config.yaml'),
        content: [
          'extensions:',
          '  chrona:',
          '    name: Chrona Truth Engine',
          `    cmd: ${cmd}`,
          '    args:',
          ...args.map((a) => `      - "${a}"`),
          '    type: stdio',
          '    enabled: true',
          '    envs: {}',
        ].join('\n'),
      });
      break;
    }

    case 'librechat': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'librechat.yaml'),
        content: [
          'mcpServers:',
          '  chrona:',
          '    type: stdio',
          `    command: ${cmd}`,
          '    args:',
          ...args.map((a) => `      - "${a}"`),
          '    env: {}',
          '    timeout: 60000',
        ].join('\n'),
      });
      break;
    }

    case 'cody':
    case 'sourcegraph': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, '.vscode/settings.json'),
        content: JSON.stringify(
          {
            'cody.mcpServers': {
              chrona: {
                command: cmd,
                args,
                env: {},
              },
            },
          },
          null,
          2
        ),
      });
      break;
    }

    case 'kiro': {
      addStdioServer(platform, '.kiro/settings/mcp.json', {
        disabled: false,
        autoApprove: ['verify_documentation_claim', 'get_verified_context', 'discover_evidence'],
      });
      break;
    }

    case 'kilo': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'kilo.jsonc'),
        content: [
          '// Kilo Code Agent Configuration',
          '{',
          '  "$schema": "https://kilo.ai/config.json",',
          '  "mcp": {',
          '    "chrona": {',
          '      "type": "local",',
          `      "command": [${[cmd, ...args].map((s) => `"${s}"`).join(', ')}],`,
          '      "enabled": true',
          '    }',
          '  }',
          '}',
        ].join('\n'),
      });
      break;
    }

    case 'command-code': {
      addStdioServer(platform, '.commandcode/mcp.json');
      break;
    }

    case 'cline': {
      addStdioServer(platform, '.cline/mcp.json', {
        disabled: false,
        autoApprove: ['verify_documentation_claim', 'get_verified_context'],
      });
      break;
    }

    case 'roo':
    case 'roo-code': {
      addStdioServer(platform, '.roo/mcp.json', {
        disabled: false,
        autoApprove: ['verify_documentation_claim', 'get_verified_context'],
      });
      break;
    }

    case 'opencode': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'opencode.json'),
        content: JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            mcp: {
              chrona: {
                type: 'local',
                command: [cmd, ...args],
                enabled: true,
                permission: {
                  tools: {
                    verify_documentation_claim: 'allow',
                    get_verified_context: 'allow',
                    discover_evidence: 'allow',
                  },
                },
              },
            },
          },
          null,
          2
        ),
      });
      break;
    }

    case 'qoder': {
      addStdioServer(platform, '.qoder/.mcp.json', { type: 'stdio' });
      break;
    }

    case 'mimo':
    case 'mimo-code': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'mimocode.jsonc'),
        content: [
          '// Xiaomi MiMo Code MCP Configuration',
          '{',
          '  "$schema": "https://mimo.xiaomi.com/mimocode/config.json",',
          '  "mcp": {',
          '    "chrona": {',
          `      "command": "${cmd}",`,
          `      "args": [${args.map((a) => `"${a}"`).join(', ')}],`,
          '      "enabled": true',
          '    }',
          '  }',
          '}',
        ].join('\n'),
      });
      break;
    }

    case 'deepseek':
    case 'dsh': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'cordis.patch.yml'),
        content: [
          '# DeepSeek Harness Cordis Patch Layer',
          '- insert:',
          '    - id: mcp-chrona',
          "      name: '@deepseek-ai/dsh-mcp-client'",
          '      config:',
          '        serverName: chrona',
          '        transport: stdio',
          `        command: ${cmd}`,
          '        args:',
          ...args.map((a) => `          - '${a}'`),
        ].join('\n'),
      });
      break;
    }

    case 'codex':
    case 'openai': {
      configs.push({
        platform,
        targetPath: path.resolve(cwd, 'codex-tools.json'),
        content: JSON.stringify(
          [
            {
              type: 'function',
              function: {
                name: 'verify_documentation_claim',
                description: 'Verifies an arbitrary documentation claim against live codebase AST and compiler rules.',
                parameters: {
                  type: 'object',
                  properties: {
                    claim: { type: 'string', description: 'The claim text to verify' },
                    file: { type: 'string', description: 'MDX file path containing the claim' },
                    line: { type: 'number', description: 'Line number in file' },
                  },
                  required: ['claim'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'get_verified_context',
                description: 'Retrieves code-verified context with provenance and confidence scores for a symbol or endpoint.',
                parameters: {
                  type: 'object',
                  properties: {
                    symbol: { type: 'string', description: 'Symbol name' },
                    query: { type: 'string', description: 'Query string' },
                  },
                },
              },
            },
          ],
          null,
          2
        ),
      });
      break;
    }

    case 'all': {
      const allPlatforms: AgentPlatform[] = [
        'antigravity',
        'claude',
        'cursor',
        'windsurf',
        'zed',
        'continue',
        'jetbrains',
        'goose',
        'librechat',
        'cody',
        'kiro',
        'kilo',
        'command-code',
        'cline',
        'roo',
        'opencode',
        'qoder',
        'mimo',
        'deepseek',
        'codex',
      ];
      for (const p of allPlatforms) {
        configs.push(...generateAgentMcpConfig(p, options));
      }
      break;
    }
  }

  return configs;
}

/**
 * Write generated agent MCP configurations to disk
 */
export async function installAgentMcpConfig(
  platform: AgentPlatform,
  options: GeneratorOptions = {}
): Promise<GeneratedConfig[]> {
  const configs = generateAgentMcpConfig(platform, options);

  for (const cfg of configs) {
    await fs.mkdir(path.dirname(cfg.targetPath), { recursive: true });
    await fs.writeFile(cfg.targetPath, cfg.content, 'utf-8');
    const rel = path.relative(options.cwd || process.cwd(), cfg.targetPath).replace(/\\/g, '/');
    console.log(picocolors.green(`  ✓ Generated MCP config for ${picocolors.bold(cfg.platform)} → ${rel}`));
    if (cfg.cliCommand) {
      console.log(picocolors.dim(`    CLI: ${cfg.cliCommand}`));
    }
  }

  return configs;
}
