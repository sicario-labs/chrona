import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'
import app from './src/server/index'

function honoPlugin() {
  return {
    name: 'hono-api-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.startsWith('/api')) {
          try {
            const host = req.headers.host || 'localhost:3000'
            const url = `http://${host}${req.url}`
            
            const headers = new Headers()
            for (const [k, v] of Object.entries(req.headers)) {
              if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : (v as string))
            }

            let body: Buffer | undefined = undefined
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              const chunks: Uint8Array[] = []
              for await (const chunk of req) {
                chunks.push(chunk)
              }
              body = Buffer.concat(chunks)
            }

            const request = new Request(url, {
              method: req.method,
              headers,
              body,
            })

            const response = await app.fetch(request)

            res.statusCode = response.status
            response.headers.forEach((val, key) => {
              res.setHeader(key, val)
            })

            const arrayBuffer = await response.arrayBuffer()
            res.end(Buffer.from(arrayBuffer))
            return
          } catch (err) {
            console.error('Hono middleware error:', err)
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    honoPlugin(),
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
