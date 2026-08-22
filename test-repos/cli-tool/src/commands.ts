export interface BuildCommandOptions {
  entry: string;
  outDir?: string;
  minify?: boolean;
  target?: 'node' | 'browser';
}

export function runBuild(options: BuildCommandOptions): { success: boolean; output: string } {
  return {
    success: true,
    output: `${options.outDir || 'dist'}/${options.entry}`,
  };
}

export function runClean(dir: string = 'dist'): void {
  // clean directory
}
