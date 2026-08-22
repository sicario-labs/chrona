import path from 'node:path';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { ChronaWorkspace } from '../packages/engine/src/workspace/model';
import { workspaceToRegistryModel } from '../packages/engine/src/registry/serializer';

async function run() {
  const pkgArg = process.argv[2];
  if (!pkgArg) {
    console.error('Usage: tsx mock-registry-experiment.ts <package@version>');
    process.exit(1);
  }

  // Parse zustand@5.0.3
  const lastAt = pkgArg.lastIndexOf('@');
  const pkgName = lastAt > 0 ? pkgArg.slice(0, lastAt) : pkgArg;
  const pkgVersion = lastAt > 0 ? pkgArg.slice(lastAt + 1) : 'latest';

  console.log(`\n[1] MOCK REGISTRY PUBLISH EXPERIMENT`);
  console.log(`Target: ${pkgName} @ ${pkgVersion}`);

  // Create isolated temp dir
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrona-mock-'));
  console.log(`\n[2] Downloading package to ${tmpDir}...`);

  // We write a basic package.json so we can install it
  await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: "mock-install", version: "1.0.0" }));
  
  execSync(`npm install ${pkgName}@${pkgVersion} --no-save`, { cwd: tmpDir, stdio: 'inherit' });

  const pkgDir = path.join(tmpDir, 'node_modules', pkgName);

  // Get actual version installed
  const actualPkgJson = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const actualVersion = actualPkgJson.version;

  console.log(`\n[3] Compiling Local Chrona Workspace for ${pkgName}@${actualVersion}...`);
  // Initialize workspace from the downloaded node_modules package
  const workspace = await ChronaWorkspace.fromDirectory(pkgDir);
  
  const symbols = workspace.software.symbols.size;
  console.log(`✓ Analyzed! Found ${symbols} exports.`);

  console.log(`\n[4] Generating Cryptographically-Pinned Registry Artifact...`);
  const registryModel = workspaceToRegistryModel(workspace, pkgName, actualVersion, {
    publisherToken: 'mock-experiment',
    buildEnvironment: 'local-test',
    chronaVersion: '0.2.0'
  });

  const mockRegDir = path.join(process.cwd(), '.chrona-mock-registry', pkgName);
  await fs.mkdir(mockRegDir, { recursive: true });
  const mockPath = path.join(mockRegDir, `${actualVersion}.json`);
  
  await fs.writeFile(mockPath, JSON.stringify(registryModel, null, 2));

  console.log(`✓ Artifact generated! SHA-256: ${registryModel.checksum}`);
  console.log(`✓ Saved to: ${mockPath}`);

  console.log(`\n[5] SUCCESS. The artifact is ready to be consumed by GET Workspace!`);
  console.log(`Run a workspace projection on an app that uses ${pkgName} to test the bridge.\n`);
}

run().catch(console.error);
