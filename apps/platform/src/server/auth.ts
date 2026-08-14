import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './db/schema'

// You will need to provide this in your environment or Hono context
const connectionString = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/chrona'

const pool = new Pool({
  connectionString,
})

export const db = drizzle(pool, { schema })

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  database: drizzleAdapter(db, {
    provider: "pg", // PostgreSQL
    schema: {
        user: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification
    }
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }
  },
})
