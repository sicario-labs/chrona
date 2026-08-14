export interface Env {
  BUILD_QUEUE: Queue<BuildJob>
  CHRONA_BUILDS: R2Bucket
  AI: any
  VECTOR_INDEX: any
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
        
        // 5. Generate embeddings and index them in Vectorize
        const vectorChunks: any[] = [];
        
        for (const [path, data] of Object.entries(result.pages)) {
          if (!data.chunks || data.chunks.length === 0) continue;
          
          try {
            // Generate embeddings for all chunks in this page using Cloudflare AI
            const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
              text: data.chunks
            });
            
            // embeddingResponse.data is an array of number arrays (embeddings)
            const embeddings = embeddingResponse.data;
            
            data.chunks.forEach((chunkText, idx) => {
              vectorChunks.push({
                id: `${job.projectId}-${path.replace(/[^a-zA-Z0-9-]/g, '_')}-${idx}`,
                values: embeddings[idx],
                metadata: {
                  projectId: job.projectId,
                  path: path.replace(/\.mdx?$/, ''),
                  title: data.frontmatter?.title || 'Untitled',
                  content: chunkText
                }
              });
            });
          } catch (e) {
            console.error(`Failed to embed chunks for ${path}`, e);
          }
        }

        if (vectorChunks.length > 0) {
          try {
            // Upsert vectors in batches of 100
            for (let i = 0; i < vectorChunks.length; i += 100) {
              const batch = vectorChunks.slice(i, i + 100);
              await env.VECTOR_INDEX.upsert(batch);
            }
            console.log(`Indexed ${vectorChunks.length} chunks into Vectorize for project ${job.projectId}`);
          } catch (e) {
            console.error('Failed to upsert vectors', e);
          }
        }
        
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
