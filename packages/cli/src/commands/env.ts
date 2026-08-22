import picocolors from 'picocolors';
import {
  loadEnvLedger,
  projectId,
  saveEnvLedger,
} from '../utils/deployments';

export interface EnvOptions {
  cwd?: string;
  project?: string;
}

export async function runChronaEnvSet(key: string, value: string, options: EnvOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);

  const ledger = await loadEnvLedger();
  const env = ledger.projects[project] || {};
  env[key] = value;
  ledger.projects[project] = env;
  await saveEnvLedger(ledger);

  console.log(picocolors.green(`  ✓ ${picocolors.bold(key)} set for project ${project}\n`));
}

export async function runChronaEnvList(options: EnvOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);

  const ledger = await loadEnvLedger();
  const env = ledger.projects[project] || {};
  const keys = Object.keys(env);

  console.log(picocolors.bold(picocolors.cyan(`\nCHRONA ⚡ Environment — ${project}\n`)));

  if (keys.length === 0) {
    console.log(picocolors.dim('  No environment variables set. Use `chrona env set <KEY> <VALUE>`.\n'));
    return;
  }

  for (const key of keys) {
    const value = env[key];
    const display = /(secret|token|password|key|auth)/i.test(key)
      ? `${value.slice(0, 3)}***${value.slice(-2)}`
      : value;
    console.log(`  ${picocolors.bold(key)}=${picocolors.dim(display)}`);
  }
  console.log('');
}

export async function runChronaEnvGet(key: string, options: EnvOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);

  const ledger = await loadEnvLedger();
  const env = ledger.projects[project] || {};

  if (!(key in env)) {
    console.log(picocolors.dim(`  ${key} is not set for project ${project}\n`));
    return;
  }
  console.log(env[key]);
}

export async function runChronaEnvUnset(key: string, options: EnvOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);

  const ledger = await loadEnvLedger();
  const env = ledger.projects[project] || {};

  if (key in env) {
    delete env[key];
    ledger.projects[project] = env;
    await saveEnvLedger(ledger);
    console.log(picocolors.yellow(`  ✕ ${picocolors.bold(key)} unset for project ${project}\n`));
  } else {
    console.log(picocolors.dim(`  ${key} is not set for project ${project}\n`));
  }
}