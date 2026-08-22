import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Claim,
  ClaimResult,
  RepositorySnapshot,
  VerificationConfig,
  VerificationResult,
} from './claim/types';
import { ClaimExtractor } from './claim/extractor';
import { CodeClaimExtractor } from './claim/code-extractor';
import { EvidenceResolver } from './evidence/resolver';
import { DEFAULT_RULES, type Rule } from './rules';
import { runCrossDocContradictionRule } from './rules/doc-301';
import type { CompilerDiagnostic } from './compiler-types';
import { type ExtractedSymbol } from './referee/oxc-extractor';
import { IncrementalCache } from './cache/incremental-cache';
import { AdapterRegistry } from './adapters/registry';
import { RealityStore } from './sqlite/reality-store';
import { parallelMap } from './worker/pool';

export interface VerifierOptions {
  cwd?: string;
  docsDir?: string;
  sourceDir?: string;
  rules?: Rule[];
  config?: VerificationConfig;
  concurrency?: number;
  includeSources?: boolean;
  realityStore?: RealityStore;
}

export interface VerifyClaimInput {
  claim: string;
  file?: string;
  line?: number;
}

export interface VerifyClaimResult {
  status: 'verified' | 'contradicted' | 'unverified' | 'ambiguous';
  confidence: number;
  evidence: Array<{
    source: string;
    file?: string;
    line?: number;
    description?: string;
  }>;
  diagnostic: string | null;
  message?: string;
  suggestedAction?: string;
}

/**
 * DocumentationVerifier
 *
 * Implements the core Documentation Compiler Pipeline:
 * Markdown / MDX -> Claim IR -> Evidence Resolution -> Diagnostic Rules -> Verification Result
 */
import { FalsePositiveTracker } from './metrics/false-positive-tracker';

export class DocumentationVerifier {
  private cwd: string;
  private docsDir: string;
  private sourceDir?: string;
  private rules: Rule[];
  private extractor: ClaimExtractor;
  private codeExtractor: CodeClaimExtractor;
  private resolver: EvidenceResolver;
  private adapters: AdapterRegistry;
  private cache: IncrementalCache;
  private tracker: FalsePositiveTracker;
  private concurrency?: number;
  private includeSources?: boolean;

  private explicitDocsDir?: string;
  private realityStore: RealityStore;

  constructor(options: VerifierOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.explicitDocsDir = options.docsDir;
    this.docsDir = options.docsDir || path.join(this.cwd, 'content', 'docs');
    this.sourceDir = options.sourceDir;
    this.rules = options.rules || DEFAULT_RULES;
    this.extractor = new ClaimExtractor();
    this.codeExtractor = new CodeClaimExtractor({ cwd: this.cwd });
    this.resolver = new EvidenceResolver({ cwd: this.cwd });
    this.adapters = new AdapterRegistry();
    this.cache = new IncrementalCache(this.cwd);
    this.realityStore = options.realityStore || new RealityStore(this.cwd);
    this.tracker = new FalsePositiveTracker();
    this.concurrency = options.concurrency;
    this.includeSources = options.includeSources;
  }

  getTracker(): FalsePositiveTracker {
    return this.tracker;
  }

  /**
   * Verify an arbitrary documentation claim against live codebase AST
   */
  async verifyClaim(input: VerifyClaimInput): Promise<VerifyClaimResult> {
    const snapshot = await this.buildSnapshot();
    await this.resolver.preloadDependencies();
    const filePath = input.file || 'interactive.mdx';
    const line = input.line || 1;

    let targetClaim: Claim;

    if (input.claim.includes('```') || input.claim.includes('\n#')) {
      const extracted = this.extractor.extractClaims(input.claim, filePath);
      targetClaim = extracted[0] || this.createFallbackClaim(input.claim, filePath, line);
    } else {
      targetClaim = this.createFallbackClaim(input.claim, filePath, line);
    }

    // Always mark interactive verification claims as authoritative
    targetClaim.metadata = { ...targetClaim.metadata, origin: 'interactive-claim' };

    // 2. Resolve evidence
    const evidence = this.resolver.resolve(targetClaim, snapshot);
    targetClaim.evidence = evidence;

    // 3. Evaluate active rules
    let diagnostic: CompilerDiagnostic | null = null;
    for (const rule of this.rules) {
      const diag = rule.evaluate(targetClaim, evidence, snapshot);
      if (diag) {
        diagnostic = diag;
        break;
      }
    }

    let status: 'verified' | 'contradicted' | 'unverified' | 'ambiguous' = 'unverified';
    let confidence = 0.5;

    if (diagnostic) {
      status = 'contradicted';
      confidence = 1.0;
    } else {
      const astEv = evidence.find((e) => e.source === 'typescript-ast' || e.source === 'compiled-example');
      const data = astEv ? (astEv.data as { exists?: boolean; compiles?: boolean } | undefined) : undefined;
      if (astEv && data?.exists === false) {
        status = 'contradicted';
        confidence = 1.0;
      } else if (astEv && data?.exists !== false && data?.compiles !== false) {
        status = 'verified';
        confidence = 1.0;
      }
    }

    return {
      status,
      confidence,
      evidence: evidence.map((e) => ({
        source: e.source,
        file: e.file,
        line: e.line,
        description: e.description,
      })),
      diagnostic: diagnostic ? diagnostic.code : null,
      message: diagnostic ? diagnostic.message : undefined,
      suggestedAction: diagnostic ? diagnostic.suggestedAction : undefined,
    };
  }

  private createFallbackClaim(claimText: string, filePath: string, line: number): Claim {
    const idMatch = claimText.match(/\b([A-Za-z_$][\w$]*)\b/);
    const subject = idMatch ? idMatch[1] : claimText.trim();
    const type = claimText.includes('(') ? 'signature' : 'symbol';

    return {
      id: `${filePath}#L${line}:${type}:${subject}`,
      type,
      source: { file: filePath, line, text: claimText },
      subject,
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'interactive-claim' },
    };
  }

  /**
   * Discover all documentation files across content/docs, docs, or root READMEs
   */
  async discoverDocsFiles(): Promise<string[]> {
    if (this.explicitDocsDir) {
      return await this.findMdxFiles(this.explicitDocsDir);
    }

    const candidateDirs = [
      path.join(this.cwd, 'content', 'docs'),
      path.join(this.cwd, 'docs'),
      path.join(this.cwd, 'documentation'),
    ];

    for (const dir of candidateDirs) {
      try {
        const stat = await fs.stat(dir);
        if (stat.isDirectory()) {
          const discovered = await this.findMdxFiles(dir);
          if (discovered.length > 0) {
            return discovered;
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Fallback: root-level markdown files (e.g. README.md)
    const files: string[] = [];
    try {
      const rootEntries = await fs.readdir(this.cwd, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (!entry.isDirectory() && /\.(mdx|md)$/i.test(entry.name)) {
          const full = path.join(this.cwd, entry.name);
          files.push(full);
        }
      }
    } catch {
      // Ignore root read error
    }

    return files;
  }

  /**
   * Verify all documentation in the workspace against live codebase symbols
   */
  async verifyWorkspace(): Promise<VerificationResult> {
    const startTime = performance.now();
    await this.cache.init();

    // 1. Build RepositorySnapshot
    const snapshot = await this.buildSnapshot();
    
    // Preload registry data for all discovered dependencies
    await this.resolver.preloadDependencies();

    // 2. Scan all MDX files
    const mdxFiles = await this.discoverDocsFiles();

    // 3. Parallel verification across MDX files
    const fileResults = await parallelMap(
      mdxFiles,
      async (mdxFile) => {
        const relPath = path.relative(this.cwd, mdxFile).replace(/\\/g, '/');
        const stat = await fs.stat(mdxFile);
        const content = await fs.readFile(mdxFile, 'utf-8');

        // Check level-2 Claim IR cache
        const cachedClaims = await this.cache.getClaims(relPath, stat.mtimeMs);
        const fileResult = this.verifyFile(relPath, content, snapshot, cachedClaims);

        // Update level-2 cache if claims were freshly extracted
        if (!cachedClaims) {
          const hash = this.cache.computeHash(content);
          const rawClaims = fileResult.claims.map((c) => c.claim);
          await this.cache.setClaims(relPath, stat.mtimeMs, hash, rawClaims);
        }

        return fileResult;
      },
      { concurrency: this.concurrency }
    );

    if (this.includeSources) {
      const sourceDirs = await this.getSourceDirs();
      const sourceFiles: string[] = [];
      for (const dir of sourceDirs) {
        sourceFiles.push(...(await this.findSourceFiles(dir)));
      }

      const codeFileResults = await parallelMap(
        sourceFiles,
        async (file) => {
          const relPath = path.relative(this.cwd, file).replace(/\\/g, '/');
          const content = await fs.readFile(file, 'utf-8');
          const codeClaims = this.codeExtractor.extractClaims(content, relPath);
          return this.verifyFile(relPath, content, snapshot, codeClaims);
        },
        { concurrency: this.concurrency }
      );
      fileResults.push(...codeFileResults);
    }

    const allClaimResults: ClaimResult[] = [];
    const allDiagnostics: CompilerDiagnostic[] = [];

    for (const res of fileResults) {
      allClaimResults.push(...res.claims);
      allDiagnostics.push(...res.diagnostics);
    }

    // Run Cross-Doc Validation (DOC-301)
    runCrossDocContradictionRule(allClaimResults, allDiagnostics);

    await this.cache.flush();
    const duration = performance.now() - startTime;

    const suppressedCount = this.tracker.getSummary().totalSuppressed;
    const errorsCount = allDiagnostics.filter((d) => d.severity === 'error').length;
    const warningsCount = allDiagnostics.filter((d) => d.severity === 'warning').length;
    const infoCount = allDiagnostics.filter((d) => d.severity === 'info').length;

    // Mutually exclusive claim partitions: verified + contradicted + unverified + ambiguous === totalClaims
    const claimsVerified = allClaimResults.filter((c) => c.status === 'verified').length;
    const contradictionsFound = allClaimResults.filter((c) => c.status === 'contradicted').length;
    const unverifiedCount = allClaimResults.filter((c) => c.status === 'unverified').length;
    const ambiguousCount = allClaimResults.filter((c) => c.status === 'ambiguous').length;

    return {
      schemaVersion: 'v1',
      status: errorsCount > 0 ? 'fail' : warningsCount > 0 ? 'warn' : 'pass',
      errorsCount,
      warningsCount,
      infoCount,
      claims: allClaimResults,
      diagnostics: allDiagnostics,
      summary: {
        claimsVerified,
        contradictionsFound,
        unverifiedCount,
        ambiguousCount,
        suppressedCount,
        verificationTimeMs: Math.round(duration),
      },
    };
  }

  /**
   * Verify a single MDX document content string in-memory against snapshot
   */
  verifyFile(
    filePath: string,
    content: string,
    snapshot: RepositorySnapshot,
    preExtractedClaims?: Claim[] | null
  ): { claims: ClaimResult[]; diagnostics: CompilerDiagnostic[] } {
    const claims = preExtractedClaims || this.extractor.extractClaims(content, filePath);
    const claimResults: ClaimResult[] = [];
    const diagnostics: CompilerDiagnostic[] = [];

    for (const claim of claims) {
      const evidence = this.resolver.resolve(claim, snapshot);
      claim.evidence = evidence;

      let claimDiagnostic: CompilerDiagnostic | null = null;

      // Evaluate active rules against this claim & evidence
      for (const rule of this.rules) {
        const diag = rule.evaluate(claim, evidence, snapshot);
        if (diag) {
          claimDiagnostic = diag;
          diagnostics.push(diag);
          break; // Stop at first contradiction
        }
      }

      if (claimDiagnostic) {
        claim.status = 'contradicted';
      } else {
        const positiveEv = evidence.find(
          (e) =>
            e.source === 'typescript-ast' ||
            e.source === 'platform-builtin' ||
            e.source === 'dependency-export' ||
            e.source === 'test-assertion' ||
            e.source === 'compiled-example'
        );
        const data = positiveEv ? (positiveEv.data as { exists?: boolean; compiles?: boolean } | undefined) : undefined;
        if (positiveEv && data?.exists !== false && data?.compiles !== false) {
          claim.status = 'verified';
        } else {
          claim.status = 'unverified';
        }
      }

      claimResults.push({
        claim,
        status: claim.status,
        evidence,
        diagnostic: claimDiagnostic || undefined,
      });
    }

    const directives = this.tracker.parseDirectives(content, filePath);
    const { active: activeDiagnostics } = this.tracker.filterSuppressedDiagnostics(diagnostics, directives);

    const activeDiagSet = new Set(activeDiagnostics);
    for (const cr of claimResults) {
      if (cr.diagnostic) {
        if (activeDiagSet.has(cr.diagnostic)) {
          cr.status = 'contradicted';
          cr.claim.status = 'contradicted';
        } else {
          cr.status = 'unverified';
          cr.claim.status = 'unverified';
        }
      }
    }

    return { claims: claimResults, diagnostics: activeDiagnostics };
  }

  /**
   * Build ground truth repository snapshot using persistent SQLite RealityStore
   */
  async buildSnapshot(): Promise<RepositorySnapshot> {
    const sourceDirs = await this.getSourceDirs();
    const sourceFiles: string[] = [];

    for (const dir of sourceDirs) {
      sourceFiles.push(...(await this.findSourceFiles(dir)));
    }

    const fileList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }> = [];
    for (const file of sourceFiles) {
      try {
        const stat = await fs.stat(file);
        const relative = path.relative(this.cwd, file).replace(/\\/g, '/');
        fileList.push({
          relativePath: relative,
          fullPath: file,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        // Skip unreadable files
      }
    }

    await this.realityStore.sync(fileList, this.adapters);
    return this.realityStore.getSnapshot();
  }

  private async getSourceDirs(): Promise<string[]> {
    if (this.sourceDir) return [path.resolve(this.cwd, this.sourceDir)];

    const dirs: string[] = [];
    const srcDir = path.join(this.cwd, 'src');
    try {
      const stat = await fs.stat(srcDir);
      if (stat.isDirectory()) dirs.push(srcDir);
    } catch {
      // Directory doesn't exist
    }

    const packagesDir = path.join(this.cwd, 'packages');
    try {
      const stat = await fs.stat(packagesDir);
      if (stat.isDirectory()) {
        const pkgEntries = await fs.readdir(packagesDir, { withFileTypes: true });
        for (const pe of pkgEntries) {
          if (pe.isDirectory()) {
            const pkgSrc = path.join(packagesDir, pe.name, 'src');
            try {
              const s = await fs.stat(pkgSrc);
              if (s.isDirectory()) dirs.push(pkgSrc);
            } catch {
              // Package src does not exist
            }
          }
        }
      }
    } catch {
      // Packages directory does not exist
    }

    if (dirs.length === 0) {
      dirs.push(this.cwd);
    }
    return dirs;
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const supportedExts = new Set(this.adapters.getSupportedExtensions());

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name !== 'node_modules' &&
            entry.name !== 'dist' &&
            entry.name !== '.git' &&
            entry.name !== '.turbo' &&
            entry.name !== '.chrona' &&
            entry.name !== 'test-repos' &&
            entry.name !== 'fresh-benchmark-repos' &&
            entry.name !== 'fixtures'
          ) {
            files.push(...(await this.findSourceFiles(full)));
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExts.has(ext) && !entry.name.endsWith('.d.ts')) {
            files.push(full);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }

  private async findMdxFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await this.findMdxFiles(full)));
        } else if (/\.(mdx|md)$/.test(entry.name)) {
          files.push(full);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }
}

/**
 * Standalone helper to verify a single claim
 */
export async function verifyClaim(
  input: VerifyClaimInput,
  options: VerifierOptions = {}
): Promise<VerifyClaimResult> {
  const verifier = new DocumentationVerifier(options);
  return await verifier.verifyClaim(input);
}
