import fs from 'node:fs/promises';
import readline from 'node:readline';
import {
  getVerifiedContext,
  buildTruthGraph,
  computeChangeImpact,
  discoverEvidence,
  DocumentationVerifier,
  verifyClaim,
  ChronaWorkspace,
  WhyEngine,
  ClaimProver,
  ContractStore,
  AskEngine,
  ChangeModelBuilder,
  ChangeExecutor,
  ReceiptGenerator,
  EpistemicDiffer,
  DecisionStore,
  Forgetter,
  SnapshotBuilder,
  WorkspaceProjector,
} from '@chrona-engine/engine';
import {
  installAgentMcpConfig,
  generateAgentMcpConfig,
  type AgentPlatform,
} from '../mcp/config-generator';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpCommandOptions {
  cwd?: string;
  install?: AgentPlatform;
  generate?: AgentPlatform;
  scope?: 'project' | 'user';
}

/**
 * Start Chrona Agent API Server or install client MCP configurations.
 */
export async function runMcpServer(options: McpCommandOptions = {}) {
  const cwd = options.cwd || process.cwd();

  // If user requested configuration generation/installation
  if (options.install) {
    await installAgentMcpConfig(options.install, { cwd, scope: options.scope });
    return;
  }

  if (options.generate) {
    const configs = generateAgentMcpConfig(options.generate, { cwd, scope: options.scope });
    for (const cfg of configs) {
      console.log(`\n--- Config for [${cfg.platform}] (${cfg.targetPath}) ---`);
      console.log(cfg.content);
      if (cfg.cliCommand) {
        console.log(`CLI Command: ${cfg.cliCommand}`);
      }
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const sendResponse = (response: JsonRpcResponse) => {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  };

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch (err) {
      sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: err instanceof Error ? err.message : String(err) },
      });
      return;
    }

    try {
      switch (request.method) {
        case 'initialize': {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'chrona-truth-mcp',
                version: '0.1.0',
              },
              capabilities: {
                tools: { listChanged: true },
                resources: { listChanged: true, subscribe: true },
                prompts: { listChanged: true },
              },
            },
          });

          // Start Guard for proactive notifications
          const { ChronaGuard } = require('@chrona-engine/engine');
          const guard = new ChronaGuard({
            cwd,
            onEvent: (event: any) => {
              // Push notification to MCP client
              process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/resources/updated',
                params: {
                  uri: 'chrona://truth-graph',
                  event
                }
              }) + '\n');
            }
          });
          guard.start().catch(console.error);
          break;
        }

        case 'notifications/initialized': {
          // Client acknowledgement, nothing to return
          break;
        }

        case 'tools/list': {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: [
                {
                  name: 'get_workspace',
                  description:
                    'Compiles the smallest evidence-complete world required for an agent to safely reason about a task. ' +
                    'Returns a bounded TaskWorkspacePacket containing pinned snapshot ID, workspace ID, epistemic manifest, ' +
                    'machine-readable reality (architecture, call chain, contracts, risks, boundary), and materialized evidence source slices.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      task: {
                        type: 'string',
                        description:
                          'The task description (e.g. "Add rate limiting to the /login endpoint" or "Can I safely delete session.ts")',
                      },
                      intent: {
                        type: 'string',
                        enum: ['modify', 'create', 'delete', 'investigate', 'evaluate', 'refactor'],
                        description: 'The intent of the task (default: "modify")',
                      },
                      target: {
                        type: 'string',
                        description:
                          'The primary target symbol, endpoint, or file path (e.g. "POST /login", "session.ts", "redis")',
                      },
                      tokenBudget: {
                        type: 'number',
                        description: 'Maximum token budget for materialized source slices (default: 8000)',
                      },
                    },
                    required: ['task'],
                  },
                },
                {
                  name: 'verify_documentation_claim',
                  description:
                    'Verifies an arbitrary documentation claim or code statement (e.g. "createRouter accepts strict option") against live AST ground truth with DOC-xxx compiler diagnostics.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      claim: {
                        type: 'string',
                        description: 'The documentation claim or statement to verify against code truth',
                      },
                      file: {
                        type: 'string',
                        description: 'Optional file path containing the claim (e.g. content/docs/api.mdx)',
                      },
                      line: {
                        type: 'number',
                        description: 'Optional line number in documentation file',
                      },
                    },
                    required: ['claim'],
                  },
                },
                {
                  name: 'get_verified_context',
                  description:
                    'Retrieve code-verified context with provenance and confidence scores for a specific symbol, API endpoint, or topic. Always use this over unverified docs.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      symbol: {
                        type: 'string',
                        description: 'The symbol or function name to retrieve verified context for',
                      },
                      query: {
                        type: 'string',
                        description: 'A search term or query string to find matching verified claims',
                      },
                      endpoint: {
                        type: 'string',
                        description: 'HTTP endpoint route (e.g. POST /payments)',
                      },
                    },
                  },
                },
                {
                  name: 'verify_file',
                  description:
                    'Audits all documentation claims within a specific MDX or Markdown file against live codebase AST.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      file: {
                        type: 'string',
                        description: 'Path to documentation file to verify',
                      },
                    },
                    required: ['file'],
                  },
                },
                {
                  name: 'verify_repository',
                  description:
                    'Run full Documentation Compiler verification across the entire project repository.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      docsDir: {
                        type: 'string',
                        description: 'Path to documentation directory (defaults to content/docs)',
                      },
                    },
                  },
                },
                {
                  name: 'search_claims',
                  description:
                    'Find documentation claims and live code evidence matching a symbol name or topic.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      symbol: {
                        type: 'string',
                        description: 'Symbol name to search claims for',
                      },
                    },
                    required: ['symbol'],
                  },
                },
                {
                  name: 'get_agent_work_order',
                  description:
                    'Compute change impact from Git diff and return structured AgentWorkOrder repair tasks for drifted knowledge claims.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      commit: {
                        type: 'string',
                        description: 'Target commit or base branch to compute diff against (default HEAD)',
                      },
                    },
                  },
                },
                {
                  name: 'discover_evidence',
                  description:
                    'Extract all exported symbols, types, functions, and parameters directly from live code.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sourceDir: {
                        type: 'string',
                        description: 'Path to source directory (defaults to src)',
                      },
                    },
                  },
                },
                {
                  name: 'get_workspace_model',
                  description:
                    'Inspect the complete epistemic model of the software workspace: software symbols, knowledge claims, evidence sources, relationships, and integrity metrics.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      includeRelationships: {
                        type: 'boolean',
                        description: 'Whether to include full relationship graph edges',
                      },
                    },
                  },
                },
                {
                  name: 'why_does_this_exist',
                  description:
                    'Explain why a symbol, file, or architectural component exists with full Git provenance, history, dependents, and deletion safety analysis.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      target: {
                        type: 'string',
                        description: 'Symbol or file path to investigate (e.g. src/auth/session.ts or createRouter)',
                      },
                      change: {
                        type: 'string',
                        description: 'Optional intended change (e.g. "delete session.ts") to evaluate safety and blocking contracts',
                      },
                    },
                    required: ['target'],
                  },
                },
                {
                  name: 'prove_claim',
                  description:
                    'Authoritatively proves or disproves any natural language software claim against multi-tier evidence (AST, tests, contracts, git).',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      claim: {
                        type: 'string',
                        description: 'The natural language claim to prove (e.g. "createRouter accepts strict mode")',
                      },
                    },
                    required: ['claim'],
                  },
                },
                {
                  name: 'get_behavioral_contracts',
                  description:
                    'List and query all active, violated, and inferred behavioral contracts across the codebase.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      subject: {
                        type: 'string',
                        description: 'Filter by symbol or module path',
                      },
                      type: {
                        type: 'string',
                        description: 'Filter by contract type (e.g. authorization, persistence, invariant)',
                      },
                    },
                  },
                },
                {
                  name: 'ask_software_architecture',
                  description:
                    'Ask natural-language architectural questions grounded in authoritative evidence (e.g. "Can I safely remove Redis?").',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      question: {
                        type: 'string',
                        description: 'The architectural question to ask Chrona',
                      },
                    },
                    required: ['question'],
                  },
                },
                {
                  name: 'plan_verified_change',
                  description:
                    'Build a complete change model: affected boundary, historical constraints, behavioral contracts at risk, breakage risks, and migration plan.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      request: {
                        type: 'string',
                        description: 'The requested change (e.g. "replace auth with Clerk" or "remove Redis")',
                      },
                    },
                    required: ['request'],
                  },
                },
                {
                  name: 'execute_verified_change',
                  description:
                    'Run full post-change verification across contracts, tests, and AST ground truth, generating a signed cryptographic verification receipt.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      request: {
                        type: 'string',
                        description: 'The change description to verify and seal into a receipt',
                      },
                    },
                    required: ['request'],
                  },
                },
                {
                  name: 'get_verification_receipt',
                  description:
                    'Retrieve a past cryptographic verification receipt by ID or list recent receipts.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      id: {
                        type: 'string',
                        description: 'Receipt ID (e.g. CHRONA-PROOF-9D72-A3B1)',
                      },
                    },
                  },
                },
                {
                  name: 'get_epistemic_diff',
                  description:
                    'Inspect what changed in the software self-understanding (established contracts, broken contracts, epistemic deltas).',
                  inputSchema: {
                    type: 'object',
                    properties: {},
                  },
                },
                {
                  name: 'record_architectural_decision',
                  description:
                    'Record an institutional architectural decision with provenance and attach it to software memory.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      statement: {
                        type: 'string',
                        description: 'The architectural decision statement',
                      },
                      rationale: {
                        type: 'string',
                        description: 'The reason / background for the decision',
                      },
                      tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Tags or categories for the decision',
                      },
                    },
                    required: ['statement'],
                  },
                },
                {
                  name: 'get_orphaned_knowledge',
                  description:
                    'Find claims, contracts, or decisions in software memory that are no longer supported by code reality.',
                  inputSchema: {
                    type: 'object',
                    properties: {},
                  },
                },
              ],
            },
          });
          break;
        }

        case 'tools/call': {
          const { name, arguments: rawArgs = {} } = request.params || {};
          const args = rawArgs as Record<string, unknown>;

          if (name === 'get_workspace') {
            const snapshotBuilder = new SnapshotBuilder(cwd);
            const snapshot = await snapshotBuilder.buildSnapshot({ cwd });
            const projector = new WorkspaceProjector();
            const packet = await projector.project(snapshot, {
              task: String(args.task || ''),
              intent: args.intent as any,
              target: args.target ? String(args.target) : undefined,
              tokenBudget: args.tokenBudget ? Number(args.tokenBudget) : undefined,
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(packet, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'verify_documentation_claim') {
            const res = await verifyClaim(
              {
                claim: String(args.claim || ''),
                file: args.file ? String(args.file) : undefined,
                line: args.line ? Number(args.line) : undefined,
              },
              { cwd }
            );

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_verified_context') {
            const context = await getVerifiedContext({
              cwd,
              symbol: args.symbol as string,
              query: args.query as string,
              endpoint: args.endpoint as string,
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(context, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'verify_file') {
            const verifier = new DocumentationVerifier({ cwd });
            const snapshot = await verifier.buildSnapshot();
            const filePath = String(args.file || '');
            const content = await fs.readFile(filePath, 'utf-8');
            const fileRes = verifier.verifyFile(filePath, content, snapshot);

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(fileRes, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'verify_repository' || name === 'check_truth_status') {
            const verifier = new DocumentationVerifier({
              cwd,
              docsDir: args.docsDir ? String(args.docsDir) : undefined,
            });
            const res = await verifier.verifyWorkspace();

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'search_claims') {
            const sym = String(args.symbol || '');
            const context = await getVerifiedContext({ cwd, symbol: sym });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(context, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_agent_work_order') {
            const workOrder = await computeChangeImpact({ cwd, commit: args.commit as string });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(workOrder, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'discover_evidence') {
            const evidence = await discoverEvidence({ cwd, sourceDir: args.sourceDir as string });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(evidence, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_workspace_model') {
            const ws = await ChronaWorkspace.fromDirectory(cwd);
            const overview = ws.getOverview();
            const resultPayload: Record<string, unknown> = {
              overview,
            };
            if (args.includeRelationships) {
              resultPayload.relationships = ws.relationships;
            }

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(resultPayload, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'why_does_this_exist') {
            const whyEngine = new WhyEngine(cwd);
            const res = await whyEngine.explainWhy({
              cwd,
              target: String(args.target || ''),
              changeIntent: args.change ? String(args.change) : undefined,
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'prove_claim') {
            const prover = new ClaimProver(cwd);
            const res = await prover.proveClaim({
              cwd,
              claim: String(args.claim || ''),
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_behavioral_contracts') {
            const store = new ContractStore(cwd);
            store.load();
            const contracts = store.query({
              subject: args.subject as string | undefined,
              type: args.type as string | undefined,
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(contracts, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'ask_software_architecture') {
            const askEngine = new AskEngine(cwd);
            const res = await askEngine.ask(String(args.question || ''));

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'plan_verified_change') {
            const builder = new ChangeModelBuilder(cwd);
            const model = await builder.buildModel({
              cwd,
              request: String(args.request || ''),
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(model, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'execute_verified_change') {
            const builder = new ChangeModelBuilder(cwd);
            const executor = new ChangeExecutor(cwd);
            const model = await builder.buildModel({
              cwd,
              request: String(args.request || ''),
            });
            const receipt = await executor.executeVerificationSweep({ cwd, model });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(receipt, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_verification_receipt') {
            const receiptGen = new ReceiptGenerator(cwd);
            const res = args.id ? receiptGen.getReceipt(String(args.id)) : receiptGen.listReceipts();

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(res, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_epistemic_diff') {
            const differ = new EpistemicDiffer(cwd);
            const diff = await differ.computeDiff();

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(diff, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'record_architectural_decision') {
            const decisionStore = new DecisionStore(cwd);
            decisionStore.load();
            const decision = decisionStore.recordDecision(String(args.statement || ''), {
              rationale: args.rationale as string | undefined,
              tags: args.tags as string[] | undefined,
              recordedBy: 'ai-agent',
            });

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(decision, null, 2),
                  },
                ],
              },
            });
          } else if (name === 'get_orphaned_knowledge') {
            const forgetter = new Forgetter(cwd);
            const report = await forgetter.findOrphanedKnowledge();

            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(report, null, 2),
                  },
                ],
              },
            });
          } else {
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Method '${name}' not found on Chrona Agent API server`,
              },
            });
          }
          break;
        }

        case 'resources/list': {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              resources: [
                {
                  uri: 'chrona://truth-graph',
                  name: 'Code Verification Graph',
                  description: 'Live knowledge graph of all verified symbols and claims',
                  mimeType: 'application/json',
                },
              ],
            },
          });
          break;
        }

        case 'resources/read': {
          const { uri } = request.params || {};
          if (uri === 'chrona://truth-graph') {
            const graph = await buildTruthGraph({ cwd });
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(graph, null, 2),
                  },
                ],
              },
            });
          } else {
            sendResponse({
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32602, message: `Resource not found: ${uri}` },
            });
          }
          break;
        }

        case 'prompts/list': {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              prompts: [
                {
                  name: 'truth_referee_audit',
                  description:
                    'Audit codebase documentation against live code ground truth and apply necessary repairs.',
                },
              ],
            },
          });
          break;
        }

        default: {
          sendResponse({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `Method not found: ${request.method}` },
          });
        }
      }
    } catch (err) {
      sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message: 'Internal MCP server error', data: err instanceof Error ? err.message : String(err) },
      });
    }
  });
}
