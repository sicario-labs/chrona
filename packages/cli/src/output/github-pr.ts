import type { VerificationResult } from '@chrona-engine/engine';
import { getOctokit } from '@actions/github';
import * as github from '@actions/github';

export async function postGitHubPrComment(result: VerificationResult, token: string): Promise<void> {
  const prNumber = github.context.payload?.pull_request?.number || 0;
  const octokit = getOctokit(token || 'mock');

  let markdown = `────────────────────────────\n`;
  if (result.status === 'pass') {
    markdown += `✅ **Documentation contract verified**\n────────────────────────────\n\n`;
    markdown += `All ${result.summary.claimsVerified} documentation claims are perfectly in sync with the codebase.`;
  } else {
    markdown += `✖ **Documentation contract broken**\n────────────────────────────\n\n`;
    
    for (const diag of result.diagnostics) {
       markdown += `**Documentation affected:**\n\`${diag.file || 'unknown'}:${diag.line}\`\n\n`;
       if (diag.claim) {
         markdown += `**Claim:**\n\`${diag.claim}\`\n\n`;
       }
       if (diag.evidence && diag.evidence.length > 0) {
         markdown += `**Reality:**\n\`${diag.evidence[0]}\`\n\n`;
       }
       if (diag.suggestedAction) {
         markdown += `**Suggested repair:**\nRun \`chrona repair\` to automatically heal this document or apply this patch manually:\n\n\`\`\`\n${diag.suggestedAction}\n\`\`\`\n\n`;
       }
       markdown += `---\n\n`;
    }
  }

  if (!github.context.payload.pull_request) {
    console.log('\n[MOCK GITHUB PR COMMENT PAYLOAD]:\n\n' + markdown);
    return;
  }

  // Find existing comment
  const { owner, repo } = github.context.repo;
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber
  });

  const existingComment = comments.data.find(c => c.body?.includes('Documentation contract'));

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body: markdown
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: markdown
    });
  }
}
