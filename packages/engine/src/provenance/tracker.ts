import * as path from 'node:path';
import { x } from 'tinyexec';
import type { CommitProvenance, SymbolProvenanceTrace } from './types';

export class ProvenanceTracker {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Retrieve provenance creation metadata for a file.
   */
  public async getFileCreation(filePath: string): Promise<CommitProvenance> {
    const rel = path.relative(this.cwd, filePath).replace(/\\/g, '/');
    try {
      // First commit that introduced this file: git log --reverse --pretty=format:"%h|%an|%ad|%s" --date=short -- file
      const res = await x(
        'git',
        ['log', '--reverse', '--pretty=format:%h|%an|%ad|%s', '--date=short', '--', rel],
        { nodeOptions: { cwd: this.cwd } }
      );
      const lines = res.stdout.trim().split('\n');
      if (lines.length > 0 && lines[0]) {
        const parts = lines[0].split('|');
        const commit = parts[0] || 'initial';
        const author = parts[1] || 'Maintainer';
        const date = parts[2] || new Date().toISOString().substring(0, 10);
        const message = parts.slice(3).join('|') || `Introduced ${path.basename(rel)}`;

        const prMatch = message.match(/#(\d+)/);
        const prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

        return {
          commit,
          author,
          date,
          message,
          prNumber,
          reason: this.cleanCommitMessage(message),
        };
      }
    } catch {
      // Non-git repository fallback
    }

    return {
      commit: 'local-init',
      author: 'Workspace Author',
      date: new Date().toISOString().substring(0, 10),
      message: `Initial creation of ${path.basename(rel)}`,
      reason: `Component created for ${path.basename(rel, path.extname(rel))}`,
    };
  }

  /**
   * Retrieve total commit touch count for a file.
   */
  public async getFileCommitCount(filePath: string): Promise<number> {
    const rel = path.relative(this.cwd, filePath).replace(/\\/g, '/');
    try {
      const res = await x('git', ['rev-list', '--count', 'HEAD', '--', rel], {
        nodeOptions: { cwd: this.cwd },
      });
      const count = parseInt(res.stdout.trim(), 10);
      return isNaN(count) ? 1 : Math.max(1, count);
    } catch {
      return 1;
    }
  }

  private cleanCommitMessage(msg: string): string {
    return msg
      .replace(/^(?:feat|fix|refactor|docs|chore|test)(?:\([^)]+\))?:\s*/i, '')
      .trim();
  }
}
