import picocolors from 'picocolors';

const ALLOWED_PROTOCOLS = ['https:', 'http:', 'vscode:', 'mailto:'];

/**
 * Format an OSC 8 ANSI Hyperlink for modern terminals (VS Code, iTerm, Windows Terminal)
 * Format: \x1b]8;;[URL]\x1b\\[Text]\x1b]8;;\x1b\\
 */
export function ansiLink(url: string, text: string): string {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return text;
    }
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
  } catch {
    return text;
  }
}

/**
 * Emit a sensory terminal bell (\x07) and failure signal for accessibility
 */
export function emitFailureSignal(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\x07');
    // OSC 633;E;1 for VS Code shell integration command failed
    process.stdout.write('\x1b]633;E;1\x07');
  }
}

/**
 * In-place ANSI Status Line (updates the same terminal line without scrollback spam)
 */
export class LiveStatus {
  private lastLineCount = 0;
  private isTTY: boolean;

  constructor() {
    this.isTTY = Boolean(process.stdout.isTTY);
  }

  update(text: string): void {
    if (!this.isTTY) {
      console.log(text);
      return;
    }

    this.clear();
    const lines = text.split('\n');
    this.lastLineCount = lines.length;
    process.stdout.write(text + '\n');
  }

  clear(): void {
    if (!this.isTTY || this.lastLineCount === 0) return;
    for (let i = 0; i < this.lastLineCount; i++) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Move up 1 line and clear it
    }
    this.lastLineCount = 0;
  }

  done(finalText?: string): void {
    this.clear();
    if (finalText) {
      console.log(finalText);
    }
  }
}

/**
 * Render a visual span-level code drift diff in the terminal
 */
export function renderDriftDiff(
  code: string,
  message: string,
  file: string,
  line: number,
  claim: string,
  evidence: string[],
  suggestedAction?: string
): void {
  console.log(picocolors.bold(picocolors.red(`\n✖ [${code}] `) + picocolors.white(message)));
  console.log(picocolors.dim(`  at ${file}:${line}\n`));

  console.log(picocolors.bold('  ┌─ ') + picocolors.yellow('Documentation Claim (Outdated)'));
  console.log(picocolors.bold('  │  ') + picocolors.red(`- ${claim}`));
  console.log(picocolors.bold('  │'));
  console.log(picocolors.bold('  ├─ ') + picocolors.cyan('Codebase Truth (Source of Truth)'));
  for (const ev of evidence) {
    console.log(picocolors.bold('  │  ') + picocolors.green(`+ ${ev}`));
  }

  if (suggestedAction) {
    console.log(picocolors.bold('  │'));
    console.log(picocolors.bold('  └─ ') + picocolors.magenta(`Suggested Action: ${suggestedAction}`));
  } else {
    console.log(picocolors.bold('  └──────────────────────────────────────────────'));
  }
  console.log('');
}
