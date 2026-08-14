import { pgTable, text, timestamp, uuid, bigint, boolean, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
})

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').default('free'),
  bachsCustomerId: text('bachs_customer_id'),
  createdAt: timestamp('created_at').defaultNow()
})

export const members = pgTable('members', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('editor'),
  invitedAt: timestamp('invited_at').defaultNow(),
  acceptedAt: timestamp('accepted_at'),
})

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  githubRepo: text('github_repo'),
  githubInstallationId: bigint('github_installation_id', { mode: 'number' }),
  githubBranch: text('github_branch').default('main'),
  sourceDir: text('source_dir').default('/'),
  theme: text('theme').default('neutral'),
  layout: text('layout').default('docs'),
  configJson: jsonb('config_json').default({}),
  customDomain: text('custom_domain'),
  customDomainTxtName: text('custom_domain_txt_name'),
  customDomainTxtValue: text('custom_domain_txt_value'),
  customDomainStatus: text('custom_domain_status').default('none'), // none, pending, active, active_redeploying, moved, deleted, etc.
  themeConfig: jsonb('theme_config').default({}),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow()
})

export const pageViews = pgTable('page_views', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  visitorId: text('visitor_id'), // hash of IP + UserAgent for unique visitor tracking without PII
  userAgent: text('user_agent'),
  referer: text('referer'),
  createdAt: timestamp('created_at').defaultNow()
})

export const searchQueries = pgTable('search_queries', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  visitorId: text('visitor_id'),
  resultsCount: bigint('results_count', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow()
})
