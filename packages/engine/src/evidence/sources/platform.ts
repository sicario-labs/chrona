import fs from 'node:fs';
import path from 'node:path';

export interface PlatformEvidence {
  isPlatform: boolean;
  category?: 'ecmascript' | 'web' | 'node' | 'react' | 'testing';
  environmentSource?: string; // e.g. "tsconfig.json (lib: DOM)", "tsconfig.json (types: node)"
  description?: string;
}

// Core ECMAScript built-in specifications (ECMA-262)
const ECMASCRIPT_GLOBALS = new Set([
  'Object', 'Function', 'Boolean', 'Symbol', 'Error', 'EvalError', 'RangeError',
  'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'Number', 'BigInt',
  'Math', 'Date', 'String', 'RegExp', 'Array', 'Int8Array', 'Uint8Array',
  'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Map',
  'Set', 'WeakMap', 'WeakSet', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView',
  'Promise', 'Generator', 'GeneratorFunction', 'AsyncFunction', 'AsyncGenerator',
  'AsyncGeneratorFunction', 'Reflect', 'Proxy', 'Intl', 'JSON', 'Iterator',
  'AsyncIterator', 'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'escape', 'unescape', 'undefined', 'NaN', 'Infinity', 'globalThis',
]);

// Web / DOM Platform specifications (WHATWG / W3C)
const WEB_DOM_GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage',
  'sessionStorage', 'fetch', 'Headers', 'Request', 'Response', 'FormData',
  'Blob', 'File', 'URL', 'URLSearchParams', 'ReadableStream', 'WritableStream',
  'TransformStream', 'AbortController', 'AbortSignal', 'Event', 'CustomEvent',
  'EventTarget', 'MessageChannel', 'MessagePort', 'Worker', 'WebSocket',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'Performance',
  'crypto', 'SubtleCrypto', 'TextEncoder', 'TextDecoder', 'HTMLElement',
  'Element', 'Node', 'DocumentFragment', 'CustomElementRegistry', 'customElements',
  'alert', 'prompt', 'confirm', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
]);

// Node.js Platform specifications
const NODE_GLOBALS = new Set([
  'process', 'Buffer', 'setImmediate', 'clearImmediate', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  '__dirname', '__filename', 'module', 'exports', 'require', 'global',
]);

// React Platform & JSX specifications
const REACT_GLOBALS = new Set([
  'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback',
  'useMemo', 'useRef', 'useImperativeHandle', 'useLayoutEffect',
  'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
  'useSyncExternalStore', 'useInsertionEffect', 'useOptimistic', 'useActionState',
  'createContext', 'forwardRef', 'memo', 'lazy', 'Suspense', 'Fragment',
  'StrictMode', 'Component', 'PureComponent', 'cloneElement', 'createElement',
  'isValidElement', 'Children',
]);

export class PlatformEnvironmentResolver {
  private cwd: string;
  private hasDomLib = true;
  private hasNodeLib = true;
  private hasReactContext = false;
  private initialized = false;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // 1. Inspect tsconfig.json or jsconfig.json
      const tsconfigPath = path.join(this.cwd, 'tsconfig.json');
      const jsconfigPath = path.join(this.cwd, 'jsconfig.json');
      const targetConfig = fs.existsSync(tsconfigPath) ? tsconfigPath : fs.existsSync(jsconfigPath) ? jsconfigPath : null;

      if (targetConfig) {
        const raw = fs.readFileSync(targetConfig, 'utf-8');
        // Simple comment stripping for JSON with comments
        const clean = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const config = JSON.parse(clean);
        const compilerOpts = config.compilerOptions || {};

        if (compilerOpts.lib) {
          const libs = (compilerOpts.lib as string[]).map((l) => l.toLowerCase());
          this.hasDomLib = libs.some((l) => l.includes('dom'));
        }

        if (compilerOpts.types) {
          const types = (compilerOpts.types as string[]).map((t) => t.toLowerCase());
          this.hasNodeLib = types.some((t) => t.includes('node'));
          if (types.some((t) => t.includes('react'))) {
            this.hasReactContext = true;
          }
        }

        if (compilerOpts.jsx) {
          this.hasReactContext = true;
        }
      }

      // 2. Inspect package.json for react / node dependencies
      const pkgPath = path.join(this.cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
          ...(pkg.peerDependencies || {}),
        };

        if (allDeps.react || allDeps['@types/react']) {
          this.hasReactContext = true;
        }
        if (allDeps['@types/node']) {
          this.hasNodeLib = true;
        }
      }
    } catch {
      // Fall back to permissive platform discovery
    }
  }

  resolve(symbolName: string): PlatformEvidence | null {
    this.init();

    // 1. Universal ECMAScript Built-in
    if (ECMASCRIPT_GLOBALS.has(symbolName)) {
      return {
        isPlatform: true,
        category: 'ecmascript',
        environmentSource: 'ECMAScript Standard Specification',
        description: `Standard ECMAScript specification global: "${symbolName}"`,
      };
    }

    // 2. React Platform / Context
    if (this.hasReactContext && REACT_GLOBALS.has(symbolName)) {
      return {
        isPlatform: true,
        category: 'react',
        environmentSource: 'React / JSX Environment',
        description: `React framework runtime symbol: "${symbolName}"`,
      };
    }

    // 3. Web & DOM Platform
    if (this.hasDomLib && WEB_DOM_GLOBALS.has(symbolName)) {
      return {
        isPlatform: true,
        category: 'web',
        environmentSource: 'Web / DOM WHATWG Specification',
        description: `Standard Web/DOM platform global: "${symbolName}"`,
      };
    }

    // 4. Node.js Platform
    if (this.hasNodeLib && NODE_GLOBALS.has(symbolName)) {
      return {
        isPlatform: true,
        category: 'node',
        environmentSource: 'Node.js Runtime Environment',
        description: `Standard Node.js runtime global: "${symbolName}"`,
      };
    }

    return null;
  }
}

// Global fallback helper
export function resolvePlatformSymbol(symbolName: string, cwd?: string): PlatformEvidence | null {
  const resolver = new PlatformEnvironmentResolver(cwd);
  return resolver.resolve(symbolName);
}
