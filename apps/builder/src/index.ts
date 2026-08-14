export interface Env {
  BUILD_QUEUE: Queue<BuildJob>
  CHRONA_BUILDS: R2Bucket
}

type BuildJob = {
  projectId: string
  commit: string
  githubRepo: string
  githubToken?: string // Used to access private repos
}

import { compileRepo } from './compiler';

export default {
  // We use the queue handler to receive messages from Cloudflare Queues
  async queue(batch: MessageBatch<BuildJob>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body
      console.log(`Processing build for project ${job.projectId} at commit ${job.commit}`)

      try {
        const [owner, repo] = job.githubRepo.split('/');
        
        // 1 & 2 & 3: Fetch, Parse, and Compile the repo in-memory
        const result = await compileRepo(owner, repo, job.commit, job.githubToken);
        
        // 4. Upload the built JSON artifacts to R2
        
        // Save the PageTree AST
        await env.CHRONA_BUILDS.put(
          `${job.projectId}/tree.json`,
          JSON.stringify(result.pageTree),
          { httpMetadata: { contentType: 'application/json' } }
        );

        // Save each compiled page
        const uploads = Object.entries(result.pages).map(async ([path, data]) => {
          // Normalize path for the frontend router (e.g. docs/intro.mdx -> docs/intro.json)
          const jsonPath = path.replace(/\.mdx?$/, '.json');
          
          await env.CHRONA_BUILDS.put(
            `${job.projectId}/${jsonPath}`,
            JSON.stringify(data),
            { httpMetadata: { contentType: 'application/json' } }
          );
        });

        await Promise.all(uploads);
        
        console.log(`Successfully completed build for project ${job.projectId}`)
        
        // Acknowledge the message so it isn't retried
        message.ack()
      } catch (error) {
        console.error(`Build failed for project ${job.projectId}:`, error)
        // message.retry() // Let Cloudflare Queue retry this message if it's transient
      }
    }
  },
}
