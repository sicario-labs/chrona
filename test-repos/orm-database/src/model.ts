export interface ColumnDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  primaryKey?: boolean;
}

export class Model<T = unknown> {
  private tableName: string;
  private columns: ColumnDefinition[];

  constructor(tableName: string, columns: ColumnDefinition[]) {
    this.tableName = tableName;
    this.columns = columns;
  }

  async findById(id: string | number): Promise<T | null> {
    return null;
  }

  async create(record: Partial<T>): Promise<T> {
    return record as T;
  }
}

export function defineModel<T = unknown>(name: string, columns: ColumnDefinition[]): Model<T> {
  return new Model<T>(name, columns);
}
