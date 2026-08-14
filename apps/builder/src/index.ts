export interface Env {
  // Bindings
}

type BuildJob = {
  projectId: string
  commit: string
}

export default {
  // We use the queue handler to receive messages from Cloudflare Queues
  async queue(batch: MessageBatch<BuildJob>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body
      console.log(`Processing build for project ${job.projectId} at commit ${job.commit}`)

      try {
        // Here we will:
        // 1. Fetch repo metadata via GitHub API
        // 2. Stream contents from GitHub or shallow clone
        // 3. Run the MDX compiler (@chrona/engine)
        // 4. Generate the static output tree
        // 5. Upload the bundled assets and HTML to R2/KV
        
        console.log(`Successfully completed build for project ${job.projectId}`)
        
        // Acknowledge the message so it isn't retried
        message.ack()
      } catch (error) {
        console.error(`Build failed for project ${job.projectId}:`, error)
        // message.retry() // Let Cloudflare Queue retry this message
      }
    }
  },
}
