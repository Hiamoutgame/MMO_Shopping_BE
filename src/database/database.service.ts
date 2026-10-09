import { neon, type NeonQueryPromise } from '@neondatabase/serverless';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SqlValue =
  | string
  | number
  | boolean
  | Date
  | null
  | readonly SqlValue[]
  | { readonly [key: string]: SqlValue };

type DataObject = Record<string, SqlValue>;
type DatabaseRow = Record<string, unknown>;
type TransactionQuery = NeonQueryPromise<false, false>;

@Injectable()
export class DatabaseService {
  private readonly sql: ReturnType<typeof neon>;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl =
      this.configService.get<string>('DATABASE_URL') ??
      this.configService.get<string>('DATABASE_URL_UNPOOLED');

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL or DATABASE_URL_UNPOOLED is not configured',
      );
    }

    this.sql = neon(databaseUrl);
  }

  // Dynamic identifiers cannot be passed as normal SQL parameters. Validate
  // and quote them before putting them into a query string.
  private quoteIdentifier(identifier: string): string {
    const parts = identifier.split('.');
    const validIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

    if (
      parts.length === 0 ||
      parts.length > 2 ||
      parts.some((part) => !validIdentifier.test(part))
    ) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return parts.map((part) => `"${part}"`).join('.');
  }

  private buildWhereClause(
    conditions: DataObject,
    startParameter = 1,
  ): { clause: string; params: SqlValue[] } {
    const entries = Object.entries(conditions);

    if (entries.length === 0) {
      return { clause: 'TRUE', params: [] };
    }

    return {
      clause: entries
        .map(
          ([key], index) =>
            `${this.quoteIdentifier(key)} = $${startParameter + index}`,
        )
        .join(' AND '),
      params: entries.map(([, value]) => value),
    };
  }

  private async queryRows(
    query: string,
    params: SqlValue[] = [],
  ): Promise<DatabaseRow[]> {
    const result = await this.sql.query(query, params);
    return result as DatabaseRow[];
  }

  // Lấy tất cả dữ liệu từ một bảng
  async getAllData(tableName: string): Promise<DatabaseRow[]> {
    return this.queryRows(`SELECT * FROM ${this.quoteIdentifier(tableName)}`);
  }

  // Lấy dữ liệu theo ID
  async getDataById(
    tableName: string,
    id: number,
  ): Promise<DatabaseRow | undefined> {
    const data = await this.queryRows(
      `SELECT * FROM ${this.quoteIdentifier(tableName)} WHERE id = $1`,
      [id],
    );
    return data[0];
  }

  // Tạo dữ liệu mới
  async createData(
    tableName: string,
    dataObject: DataObject,
  ): Promise<DatabaseRow | undefined> {
    const entries = Object.entries(dataObject);

    if (entries.length === 0) {
      throw new Error('Cannot insert an empty data object');
    }

    const columns = entries.map(([key]) => this.quoteIdentifier(key));
    const params = entries.map(([, value]) => value);
    const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
    const data = await this.queryRows(
      `INSERT INTO ${this.quoteIdentifier(tableName)} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      params,
    );
    return data[0];
  }

  // Cập nhật dữ liệu
  async updateData(
    tableName: string,
    id: number,
    dataObject: DataObject,
  ): Promise<DatabaseRow | undefined> {
    const entries = Object.entries(dataObject);

    if (entries.length === 0) {
      throw new Error('Cannot update with an empty data object');
    }

    const params = entries.map(([, value]) => value);
    const assignments = entries
      .map(([key], index) => `${this.quoteIdentifier(key)} = $${index + 1}`)
      .join(', ');
    const data = await this.queryRows(
      `UPDATE ${this.quoteIdentifier(tableName)} SET ${assignments} WHERE id = $${params.length + 1} RETURNING *`,
      [...params, id],
    );
    return data[0];
  }

  // Xóa dữ liệu
  async deleteData(
    tableName: string,
    id: number,
  ): Promise<DatabaseRow | undefined> {
    const data = await this.queryRows(
      `DELETE FROM ${this.quoteIdentifier(tableName)} WHERE id = $1 RETURNING *`,
      [id],
    );
    return data[0];
  }

  // Query tùy chỉnh với placeholder PostgreSQL ($1, $2, ...)
  async executeQuery(
    query: string,
    params: SqlValue[] = [],
  ): Promise<DatabaseRow[]> {
    return this.queryRows(query, params);
  }

  // Tìm kiếm với LIKE
  async searchData(
    tableName: string,
    column: string,
    keyword: string,
    limit = 10,
  ): Promise<DatabaseRow[]> {
    return this.queryRows(
      `SELECT * FROM ${this.quoteIdentifier(tableName)} WHERE ${this.quoteIdentifier(column)} ILIKE $1 ORDER BY id DESC LIMIT $2`,
      [`%${keyword}%`, limit],
    );
  }

  // Join nhiều bảng - ví dụ Orders với Users
  async getOrdersWithUserDetails(userId?: number): Promise<DatabaseRow[]> {
    if (userId !== undefined) {
      return this.queryRows(
        `
          SELECT
            o.*,
            u.name as user_name,
            u.email as user_email
          FROM orders o
          JOIN users u ON o.user_id = u.id
          WHERE o.user_id = $1
          ORDER BY o.created_at DESC
        `,
        [userId],
      );
    }

    return this.queryRows(`
      SELECT
        o.*,
        u.name as user_name,
        u.email as user_email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
  }

  // Aggregation - đếm, tổng
  async getStatistics(tableName: string): Promise<DatabaseRow | undefined> {
    const data = await this.queryRows(`
      SELECT
        COUNT(*) as total_count,
        MAX(created_at) as last_created
      FROM ${this.quoteIdentifier(tableName)}
    `);
    return data[0];
  }

  // Pagination
  async getPaginatedData(
    tableName: string,
    page = 1,
    pageSize = 10,
  ): Promise<DatabaseRow[]> {
    const offset = (page - 1) * pageSize;
    return this.queryRows(
      `SELECT * FROM ${this.quoteIdentifier(tableName)} ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
  }

  // Bulk insert
  async bulkInsert(
    tableName: string,
    dataArray: ReadonlyArray<DataObject>,
  ): Promise<DatabaseRow[]> {
    if (dataArray.length === 0) {
      return [];
    }

    const columns = Object.keys(dataArray[0]);
    if (columns.length === 0) {
      throw new Error('Cannot bulk insert an empty data object');
    }

    const params: SqlValue[] = [];
    const rows = dataArray.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        params.push(row[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    return this.queryRows(
      `INSERT INTO ${this.quoteIdentifier(tableName)} (${columns.map((column) => this.quoteIdentifier(column)).join(', ')}) VALUES ${rows.join(', ')} RETURNING *`,
      params,
    );
  }

  // Transaction example - transfer balance
  async executeTransaction(queries: TransactionQuery[]): Promise<unknown> {
    try {
      return await this.sql.transaction(queries);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Transaction failed: ${message}`);
    }
  }

  // Check if record exists
  async exists(tableName: string, conditions: DataObject): Promise<boolean> {
    const where = this.buildWhereClause(conditions);
    const result = await this.queryRows(
      `SELECT EXISTS(SELECT 1 FROM ${this.quoteIdentifier(tableName)} WHERE ${where.clause}) AS exists`,
      where.params,
    );
    return Boolean(result[0]?.exists);
  }

  // Get count
  async getCount(tableName: string, conditions?: DataObject): Promise<number> {
    const table = this.quoteIdentifier(tableName);

    if (conditions) {
      const where = this.buildWhereClause(conditions);
      const result = await this.queryRows(
        `SELECT COUNT(*) AS count FROM ${table} WHERE ${where.clause}`,
        where.params,
      );
      return Number(result[0]?.count ?? 0);
    }

    const data = await this.queryRows(`SELECT COUNT(*) AS count FROM ${table}`);
    return Number(data[0]?.count ?? 0);
  }
}
