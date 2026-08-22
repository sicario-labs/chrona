# AI Coding Agent Context & Rules

This repository maintains the database connection engine for the monorepo.

## Primary Entry Points
- `createDatabasePool(url: string)`: Factory function returning an active `DatabasePool`.
- `DatabasePool.prototype.executeQuery(sql, params)`: Executes SQL queries returning promise of records.

## Conventions
- Always import from `@sample/agent-monorepo`.
- All pool instances must be instantiated using `createDatabasePool`.
