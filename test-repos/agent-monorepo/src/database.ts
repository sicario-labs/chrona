export interface QueryOptions {
  limit?: number;
  offset?: number;
}

export class DatabasePool {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async executeQuery<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return [] as T[];
  }
}

export function createDatabasePool(url: string): DatabasePool {
  return new DatabasePool(url);
}
