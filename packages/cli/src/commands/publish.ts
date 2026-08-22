import { Command } from 'commander';
import { ChronaWorkspace, workspaceToRegistryModel, RegistryClient } from '@chrona-engine/engine';
import pc from 'picocolors';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

function getChronaVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

export function runPublishCommand(program: Command) {
  program
    .command('publish')
    .description('Publish verified types and signature models to the Chrona Truth Registry')
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .option('-t, --token <token>', 'Chrona Registry API Token')
    .action(async (options) => {
      try {
        console.log(pc.blue('- Extracting workspace ground truth...'));
        const workspace = await ChronaWorkspace.fromDirectory(options.dir);

        if (!workspace.manifest.name) {
          console.error(pc.red('o- Failed: Workspace has no package name (check package.json)'));
          process.exit(1);
        }

        const version = process.env.npm_package_version || '0.0.0'; // Fallback

        console.log(pc.gray(`  Found ${workspace.software.symbolsCount} symbols in ${workspace.manifest.name}@${version}`));
        
        // Block if soundness is too low
        if (workspace.integrity.status === 'fail') {
          console.error(pc.red('\no- Cannot publish: Workspace has contradictions.'));
          console.error(pc.yellow(`  Resolve all contradictions via 'chrona check' before publishing to registry.`));
          process.exit(1);
        }

        const token = options.token || process.env.CHRONA_TOKEN || 'anonymous';
        const publisherToken = token === 'anonymous' 
          ? 'anon'
          : crypto.createHash('sha256').update(token).digest('hex').substring(0, 8);

        const buildEnvironment = process.env.CI 
          ? (process.env.GITHUB_ACTIONS ? 'ci-github' : 'ci-other')
          : 'local';

        const model = workspaceToRegistryModel(workspace, workspace.manifest.name, version, {
          publisherToken,
          buildEnvironment,
          chronaVersion: getChronaVersion()
        });
        
        console.log(pc.blue('\n- Publishing to Chrona Truth Registry...'));
        const client = new RegistryClient({ authToken: token });
        
        const result = await client.publish(model);
        console.log(pc.green(`o" Successfully published ${model.name}@${model.version}`));
        console.log(pc.gray(`  Registry URL: ${result.url}`));
        console.log(pc.gray(`  Checksum: ${model.checksum}`));
        console.log(pc.gray(`  Provenance: [${model.provenance.buildEnvironment}] commit ${model.provenance.gitCommit}`));
        
      } catch (err) {
        console.error(pc.red('o- Publish failed:'));
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
