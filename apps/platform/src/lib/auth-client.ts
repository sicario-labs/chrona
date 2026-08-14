import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: 'http://localhost:5173', // or your actual backend URL
})

export const {
  useSession,
  signIn,
  signOut,
} = authClient
