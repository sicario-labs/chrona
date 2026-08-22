import fs from 'node:fs';
import path from 'node:path';

export interface DependencyEvidence {
  isDependency: boolean;
  packageName?: string;
  version?: string;
  sourceField?: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';
  description?: string;
}

/**
 * Common popular ecosystem libraries and their standard top-level exports
 */
const KNOWN_PACKAGE_EXPORTS: Record<string, string[]> = {
  react: [
    'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback',
    'useMemo', 'useRef', 'useImperativeHandle', 'useLayoutEffect',
    'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
    'useSyncExternalStore', 'useInsertionEffect', 'createContext',
    'forwardRef', 'memo', 'lazy', 'Suspense', 'Fragment', 'StrictMode',
    'Component', 'PureComponent', 'createElement', 'cloneElement'
  ],
  'react-dom': ['render', 'hydrate', 'createPortal', 'flushSync', 'createRoot', 'hydrateRoot'],
  immer: ['produce', 'produceWithPatches', 'applyPatches', 'enablePatches', 'enableMapSet', 'createDraft', 'finishDraft', 'castDraft', 'castImmutable', 'current', 'isDraft', 'original'],
  redux: ['createStore', 'combineReducers', 'bindActionCreators', 'applyMiddleware', 'compose'],
  '@reduxjs/toolkit': ['createSlice', 'configureStore', 'createAsyncThunk', 'createReducer', 'createAction', 'createEntityAdapter'],
  zod: ['z', 'ZodSchema', 'ZodType', 'ZodError', 'infer'],
  axios: ['axios', 'Axios', 'AxiosError', 'isAxiosError', 'get', 'post', 'put', 'delete'],
  vitest: ['describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'vi'],
  jest: ['describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'jest'],
};

/**
 * Resolves whether a symbol is provided by an external package declared in package.json.
 */
import { DeclarationResolver } from './declaration';
import { RegistryClient } from '../../registry/client';
import { registryModelToEvidence } from '../../registry/serializer';
import type { Evidence } from '../../claim/types';

export class DependencyResolver {
  private cwd: string;
  private dependencies: Map<string, { version: string; type: DependencyEvidence['sourceField'] }> = new Map();
  private initialized = false;
  private declarationResolver: DeclarationResolver;
  private registryClient: RegistryClient;
  private registryData: Map<string, any> = new Map();

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.declarationResolver = new DeclarationResolver(cwd);
    this.registryClient = new RegistryClient();
  }

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const pkgPath = path.join(this.cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        const fields = [
          'dependencies',
          'devDependencies',
          'peerDependencies',
          'optionalDependencies',
        ] as const;

        for (const f of fields) {
          const section = pkg[f];
          if (section && typeof section === 'object') {
            for (const [name, version] of Object.entries(section)) {
              this.dependencies.set(name, { version: String(version), type: f });
            }
          }
        }
      }
    } catch {
      // Ignore package.json read failure
    }
  }

  async preloadRegistryData(): Promise<void> {
    this.init();
    const promises = Array.from(this.dependencies.entries()).map(async ([pkgName, info]) => {
      try {
        const data = await this.registryClient.fetch(pkgName, info.version.replace(/[\^~]/g, ''));
        if (data) {
          this.registryData.set(pkgName, data);
        }
      } catch (err) {
        // Skip on fetch failure
      }
    });
    await Promise.all(promises);
  }

  resolveSymbol(symbolName: string, moduleSpecifier?: string): DependencyEvidence | null {
    this.init();

    // 1. If explicit moduleSpecifier is passed (e.g. import { produce } from 'immer')
    if (moduleSpecifier) {
      const basePkg = moduleSpecifier.startsWith('@')
        ? moduleSpecifier.split('/').slice(0, 2).join('/')
        : moduleSpecifier.split('/')[0];

      if (this.dependencies.has(basePkg)) {
        const info = this.dependencies.get(basePkg)!;
        
        // Upgrade: check registry first, then local types
        const registryModel = this.registryData.get(basePkg);
        let typeEv = null;
        if (registryModel) {
          const registryEv = registryModelToEvidence(registryModel, symbolName);
          if (registryEv && registryEv.data) {
            typeEv = registryEv.data;
            typeEv.declarationFile = registryEv.file;
          }
        }
        
        if (!typeEv) {
          typeEv = this.declarationResolver.resolve(basePkg, symbolName);
        }

        return {
          isDependency: true,
          packageName: basePkg,
          version: info.version,
          sourceField: info.type,
          description: typeEv 
            ? `Symbol "${symbolName}" is imported from declared dependency "${basePkg}" (${info.version}) and found in types: ${typeEv.signature || typeEv.exportKind || 'resolved'}` 
            : `Symbol "${symbolName}" is imported from declared dependency "${basePkg}" (${info.version})`,
          // Attach typing data for rules
          typeEvidence: typeEv
        } as any; // Type override since we need to add typeEvidence to return type, let's just add it to interface
      }
    }

    // 2. Check if the symbol matches known exports of any declared dependency
    for (const [pkgName, info] of this.dependencies.entries()) {
      const knownExports = KNOWN_PACKAGE_EXPORTS[pkgName];
      if (knownExports && knownExports.includes(symbolName)) {
        return {
          isDependency: true,
          packageName: pkgName,
          version: info.version,
          sourceField: info.type,
          description: `Symbol "${symbolName}" is provided by declared dependency "${pkgName}" (${info.version})`,
        };
      }
    }

    return null;
  }

  hasDependency(pkgName: string): boolean {
    this.init();
    return this.dependencies.has(pkgName);
  }
}
