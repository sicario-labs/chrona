import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000', // Platform runs on port 3000
})

export const {
  useSession,
  signIn,
  signOut,
} = authClient
