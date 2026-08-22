import { describe, it, expect } from 'vitest';
import { runGuardCommand } from '../src/commands/guard';
import { Command } from 'commander';

describe('Guard CLI Command', () => {
  it('registers the command', () => {
    const program = new Command();
    runGuardCommand(program);
    const cmd = program.commands.find(c => c.name() === 'guard');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('Watch files');
  });

  // We skip running the actual guard in E2E since it enters a watch loop
});
