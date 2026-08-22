import * as fs from 'fs';
import * as path from 'path';

export interface DeclarationEvidence {
  found: boolean;
  packageName: string;
  declarationFile: string;
  signature?: string;
  parameters?: Array<{ name: string; type: string; optional: boolean }>;
  returnType?: string;
  exportKind?: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'unknown';
}

export class DeclarationResolver {
  private cache: Map<string, DeclarationEvidence> = new Map();

  constructor(private cwd: string) {}

  public resolve(packageName: string, symbolName: string): DeclarationEvidence | null {
    const cacheKey = `${packageName}:${symbolName}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const declFile = this.findDeclarationFile(packageName);
    if (!declFile) {
      return null;
    }

    try {
      const content = fs.readFileSync(declFile, 'utf-8');
      
      // Extremely rudimentary parsing for the sake of the MVP implementation
      // In reality, this would use oxc-parser on the .d.ts file
      const functionRegex = new RegExp(`(?:export\\s+)?(?:declare\\s+)?function\\s+${symbolName}\\s*\\(([^)]*)\\)\\s*(?::\\s*([^;{]+))?`, 'i');
      const classRegex = new RegExp(`(?:export\\s+)?(?:declare\\s+)?class\\s+${symbolName}\\b`, 'i');
      const typeRegex = new RegExp(`(?:export\\s+)?type\\s+${symbolName}\\b`, 'i');
      const interfaceRegex = new RegExp(`(?:export\\s+)?interface\\s+${symbolName}\\b`, 'i');
      const constRegex = new RegExp(`(?:export\\s+)?(?:declare\\s+)?const\\s+${symbolName}\\s*(?::\\s*([^;=]+))?`, 'i');

      let evidence: DeclarationEvidence | null = null;
      let match;

      if ((match = content.match(functionRegex))) {
        evidence = {
          found: true,
          packageName,
          declarationFile: declFile,
          exportKind: 'function',
          signature: `${symbolName}(${match[1]})${match[2] ? `: ${match[2]}` : ''}`,
          returnType: match[2]?.trim(),
          parameters: match[1].split(',').filter(Boolean).map(p => {
            const parts = p.split(':');
            return {
              name: parts[0].trim().replace('?', ''),
              optional: parts[0].includes('?'),
              type: (parts[1] || 'any').trim()
            };
          })
        };
      } else if (classRegex.test(content)) {
        evidence = { found: true, packageName, declarationFile: declFile, exportKind: 'class' };
      } else if (interfaceRegex.test(content)) {
        evidence = { found: true, packageName, declarationFile: declFile, exportKind: 'interface' };
      } else if (typeRegex.test(content)) {
        evidence = { found: true, packageName, declarationFile: declFile, exportKind: 'type' };
      } else if ((match = content.match(constRegex))) {
        evidence = { 
          found: true, 
          packageName, 
          declarationFile: declFile, 
          exportKind: 'const',
          signature: `${symbolName}: ${match[1] || 'any'}`
        };
      }

      if (evidence) {
        this.cache.set(cacheKey, evidence);
        return evidence;
      }
    } catch (e) {
      // file read err
    }

    return null;
  }

  private findDeclarationFile(packageName: string): string | null {
    try {
      const pkgJsonPath = path.join(this.cwd, 'node_modules', packageName, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.types || pkg.typings) {
          const typesPath = path.join(this.cwd, 'node_modules', packageName, pkg.types || pkg.typings);
          if (fs.existsSync(typesPath)) return typesPath;
        }
      }

      const indexDts = path.join(this.cwd, 'node_modules', packageName, 'index.d.ts');
      if (fs.existsSync(indexDts)) return indexDts;

      const typesPkgPath = path.join(this.cwd, 'node_modules', `@types`, packageName, 'index.d.ts');
      if (fs.existsSync(typesPkgPath)) return typesPkgPath;
    } catch (e) {
      // ignore
    }
    return null;
  }
}
