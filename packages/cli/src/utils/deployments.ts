import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface DeploymentRecord {
  id: string;
  project: string;
  commit: string;
  repo?: string;
  createdAt: string;
  url: string;
  status: 'live' | 'preview' | 'superseded' | 'rolled-back';
}

export interface DeploymentLedger {
  projects: Record<string, DeploymentRecord[]>;
}

export type ProjectEnv = Record<string, string>;

export interface EnvLedger {
  projects: Record<string, ProjectEnv>;
}

function ledgerPath(): string {
  return path.join(os.homedir(), '.chrona', 'deployments.json');
}

function envPath(): string {
  return path.join(os.homedir(), '.chrona', 'env.json');
}

export async function loadLedger(): Promise<DeploymentLedger> {
  try {
    return JSON.parse(await fs.readFile(ledgerPath(), 'utf-8')) as DeploymentLedger;
  } catch {
    return { projects: {} };
  }
}

export async function saveLedger(ledger: DeploymentLedger): Promise<void> {
  await fs.mkdir(path.dirname(ledgerPath()), { recursive: true });
  await fs.writeFile(ledgerPath(), JSON.stringify(ledger, null, 2), 'utf-8');
}

export async function loadEnvLedger(): Promise<EnvLedger> {
  try {
    return JSON.parse(await fs.readFile(envPath(), 'utf-8')) as EnvLedger;
  } catch {
    return { projects: {} };
  }
}

export async function saveEnvLedger(ledger: EnvLedger): Promise<void> {
  await fs.mkdir(path.dirname(envPath()), { recursive: true });
  await fs.writeFile(envPath(), JSON.stringify(ledger, null, 2), 'utf-8');
}

export function gitCommit(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export function gitRemote(cwd: string): string {
  try {
    return execSync('git config --get remote.origin.url', { cwd, stdio: 'pipe' }).toString().trim();
  } catch {
    return '';
  }
}

export function projectId(cwd: string): string {
  const base = path.basename(cwd);
  if (base === 'chrona' || base === 'docs') {
    return 'chrona-docs';
  }
  return base;
}

export function liveUrl(project: string): string {
  return `https://${project}.chronadocs.xyz/`;
}

export function permalinkUrl(project: string, deployId: string): string {
  return `https://${deployId}--${project}.chronadocs.xyz/`;
}

export function shortCommit(commit: string): string {
  return commit.length > 7 ? commit.slice(0, 7) : commit;
}