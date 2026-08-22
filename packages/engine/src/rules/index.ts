import type { Rule } from './types';
import { doc101Rule } from './doc-101';
import { doc102Rule } from './doc-102';
import { doc103Rule } from './doc-103';
import { doc107Rule } from './doc-107';
import { doc201Rule } from './doc-201';
import { doc401Rule } from './doc-401';

export * from './types';
export * from './doc-101';
export * from './doc-102';
export * from './doc-103';
export * from './doc-107';
export * from './doc-201';
export * from './doc-401';

/**
 * Standard Chrona Five Killer Rules + Deprecation rules suite
 */
export const DEFAULT_RULES: Rule[] = [
  doc101Rule,
  doc102Rule,
  doc103Rule,
  doc107Rule,
  doc201Rule,
  doc401Rule,
];
