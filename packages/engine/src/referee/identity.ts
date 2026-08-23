import fs from 'node:fs';
import path from 'node:path';

export interface PackageIdentity {
  name: string;
  root: string;
  packageJson: string;
}

/**
 * Crawls upward from the source file to find the closest package.json
 */
export function resolvePackageIdentity(filePath: string): PackageIdentity | null {
  let currentDir = path.dirname(path.resolve(filePath));
  const rootDir = path.parse(currentDir).root;

  while (currentDir !== rootDir) {
    const pkgJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const content = fs.readFileSync(pkgJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        return {
          name: pkg.name || 'unknown',
          root: currentDir,
          packageJson: pkgJsonPath
        };
      } catch {
        // malformed package.json, skip or return unknown
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Generates a stable Chrona Graph NodeId for a codebase symbol.
 * Example: pkg:@chrona/router:function:createRouter
 */
export function generateSymbolIdentity(filePath: string, kind: string, qualifiedName: string): string {
  const identity = resolvePackageIdentity(filePath);
  const pkgName = identity ? identity.name : 'workspace-root';
  return `pkg:${pkgName}:${kind}:${qualifiedName}`;
}
