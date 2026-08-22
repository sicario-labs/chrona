import * as fs from 'fs';
import * as path from 'path';
import { ChronaWorkspace } from '../workspace/model';
import { DocumentationVerifier } from '../verifier';
import { MemoryStore } from '../memory/store';
import { Evidence } from '../claim/types';
import { extractCodeClaims } from './code-claim-detector';

export interface GuardEvent {
  type: 'contradiction' | 'drift' | 'new-claim' | 'resolved';
  file: string;
  line: number;
  symbol: string;
  code?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  evidence?: Evidence;
  timestamp: string;
}

export interface GuardOptions {
  cwd: string;
  docsDir?: string;
  watchPaths?: string[];
  debounceMs?: number;
  onEvent: (event: GuardEvent) => void;
}

export class ChronaGuard {
  private watcher: fs.FSWatcher | null = null;
  private workspace!: ChronaWorkspace;
  private verifier!: DocumentationVerifier;
  private memory!: MemoryStore;
  private options: GuardOptions;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changedFiles: Set<string> = new Set();
  
  constructor(options: GuardOptions) {
    this.options = {
      watchPaths: ['src', 'docs', 'content'],
      debounceMs: 300,
      ...options
    };
  }

  async start(): Promise<void> {
    this.workspace = await ChronaWorkspace.fromDirectory(this.options.cwd);
    this.memory = this.workspace.getMemory();
    this.verifier = new DocumentationVerifier(this.options.cwd);

    // Ensure watch paths exist
    const watchPaths = (this.options.watchPaths || []).map(p => path.join(this.options.cwd, p)).filter(p => fs.existsSync(p));

    if (watchPaths.length === 0) {
      // Just watch CWD if none specified or found
      watchPaths.push(this.options.cwd);
    }

    // Node.js fs.watch on Windows/macOS supports recursive option.
    // For simplicity, we just watch the directories recursively.
    for (const watchPath of watchPaths) {
      const w = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        
        // Ignore node_modules and .git
        if (filename.includes('node_modules') || filename.includes('.git') || filename.includes('.chrona')) return;
        
        const fullPath = path.join(watchPath, filename);
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return;

        this.changedFiles.add(fullPath);
        
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.processChangedFiles().catch(console.error);
        }, this.options.debounceMs);
      });
      
      // Keep track of first watcher just for stop()
      if (!this.watcher) this.watcher = w;
    }
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.watcher) {
      // In a real impl we'd keep an array of watchers and close them all
      this.watcher.close();
      this.watcher = null;
    }
  }

  private async processChangedFiles(): Promise<void> {
    const filesToProcess = Array.from(this.changedFiles);
    this.changedFiles.clear();

    for (const file of filesToProcess) {
      try {
        await this.verifyIncrementally(file);
      } catch (err) {
        console.error(`Error verifying ${file}:`, err);
      }
    }
  }

  private async verifyIncrementally(changedFile: string): Promise<GuardEvent[]> {
    const events: GuardEvent[] = [];
    const isSourceFile = changedFile.endsWith('.ts') || changedFile.endsWith('.tsx') || changedFile.endsWith('.js');
    const isDocFile = changedFile.endsWith('.md') || changedFile.endsWith('.mdx');

    if (!isSourceFile && !isDocFile) return events;

    // Full re-verify for now in MVP incremental mode
    // Real implementation would rebuild just the snapshot for this file
    this.workspace = await ChronaWorkspace.fromDirectory(this.options.cwd);
    const result = await this.verifier.verifyWorkspace(this.workspace);

    // Check if there are new contradictions
    for (const claimResult of result.claims) {
      if (claimResult.status === 'contradicted') {
        const diagnostic = claimResult.diagnostics[0];
        if (diagnostic) {
           events.push({
             type: 'contradiction',
             file: claimResult.claim.source.file,
             line: claimResult.claim.source.line,
             symbol: claimResult.claim.subject,
             code: diagnostic.code,
             message: diagnostic.message,
             severity: diagnostic.severity,
             evidence: claimResult.evidence[0], // attach first evidence
             timestamp: new Date().toISOString()
           });
        }
      }
    }

    if (isSourceFile) {
      const content = fs.readFileSync(changedFile, 'utf-8');
      const codeClaims = extractCodeClaims(content, changedFile);
      for (const cc of codeClaims) {
         events.push({
           type: 'new-claim',
           file: cc.file,
           line: cc.line,
           symbol: cc.symbol,
           message: cc.impliedAssertion,
           severity: 'info',
           timestamp: new Date().toISOString()
         });
      }
    }

    events.forEach(e => this.options.onEvent(e));
    return events;
  }
}
