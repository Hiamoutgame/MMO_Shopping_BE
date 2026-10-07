import { neon } from '@neondatabase/serverless';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatabaseService {
  private readonly sql;

  constructor(private configService: ConfigService) {
    const databaseUrl = this.configService.get('DATABASE_URL');
    this.sql = neon(databaseUrl);
  }

  // Lấy tất cả dữ liệu từ một bảng
  async getAllData(tableName: string) {
    const data = await this.sql`SELECT * FROM ${this.sql(tableName)}`;
    return data;
  }

  // Lấy dữ liệu theo ID
  async getDataById(tableName: string, id: number) {
    const data = await this.sql`
      SELECT * FROM ${this.sql(tableName)}
      WHERE id = ${id}
    `;
    return data[0];
  }

  // Tạo dữ liệu mới
  async createData(tableName: string, dataObject: any) {
    const data = await this.sql`
      INSERT INTO ${this.sql(tableName)}
      ${this.sql(dataObject)}
      RETURNING *
    `;
    return data[0];
  }

  // Cập nhật dữ liệu
  async updateData(tableName: string, id: number, dataObject: any) {
    const data = await this.sql`
      UPDATE ${this.sql(tableName)}
      SET ${this.sql(dataObject)}
      WHERE id = ${id}
      RETURNING *
    `;
    return data[0];
  }

  // Xóa dữ liệu
  async deleteData(tableName: string, id: number) {
    const data = await this.sql`
      DELETE FROM ${this.sql(tableName)}
      WHERE id = ${id}
      RETURNING *
    `;
    return data[0];
  }

  // Query tùy chỉnh với raw SQL
  async executeQuery(query: string, params: any[] = []) {
    const data = await this.sql(query, params);
    return data;
  }

  // Tìm kiếm với LIKE
  async searchData(tableName: string, column: string, keyword: string, limit: number = 10) {
    const data = await this.sql`
      SELECT * FROM ${this.sql(tableName)}
      WHERE ${this.sql(column)} ILIKE ${`%${keyword}%`}
      ORDER BY id DESC
      LIMIT ${limit}
    `;
    return data;
  }

  // Join nhiều bảng - ví dụ Orders với Users
  async getOrdersWithUserDetails(userId?: number) {
    if (userId) {
      const data = await this.sql`
        SELECT
          o.*,
          u.name as user_name,
          u.email as user_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.user_id = ${userId}
        ORDER BY o.created_at DESC
      `;
      return data;
    } else {
      const data = await this.sql`
        SELECT
          o.*,
          u.name as user_name,
          u.email as user_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
        LIMIT 100
      `;
      return data;
    }
  }

  // Aggregation - đếm, tổng
  async getStatistics(tableName: string) {
    const data = await this.sql`
      SELECT
        COUNT(*) as total_count,
        MAX(created_at) as last_created
      FROM ${this.sql(tableName)}
    `;
    return data[0];
  }

  // Pagination
  async getPaginatedData(tableName: string, page: number = 1, pageSize: number = 10) {
    const offset = (page - 1) * pageSize;
    const data = await this.sql`
      SELECT * FROM ${this.sql(tableName)}
      ORDER BY id DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;
    return data;
  }

  // Bulk insert
  async bulkInsert(tableName: string, dataArray: any[]) {
    const data = await this.sql`
      INSERT INTO ${this.sql(tableName)}
      ${this.sql(dataArray)}
      RETURNING *
    `;
    return data;
  }

  // Transaction example - transfer balance
  async executeTransaction(queries: any[]) {
    try {
      const results = await this.sql.transaction(queries);
      return results;
    } catch (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  // Check if record exists
  async exists(tableName: string, conditions: Record<string, any>) {
    const whereClause = Object.entries(conditions)
      .map(([key, value]) => `${key} = '${value}'`)
      .join(' AND ');

    const query = `SELECT EXISTS(SELECT 1 FROM ${tableName} WHERE ${whereClause})`;
    const result = await this.sql(query);
    return result[0].exists;
  }

  // Get count
  async getCount(tableName: string, conditions?: Record<string, any>) {
    if (conditions) {
      const whereClause = Object.entries(conditions)
        .map(([key, value]) => `${key} = '${value}'`)
        .join(' AND ');
      const query = `SELECT COUNT(*) FROM ${tableName} WHERE ${whereClause}`;
      const result = await this.sql(query);
      return parseInt(result[0].count);
    } else {
      const data = await this.sql`SELECT COUNT(*) FROM ${this.sql(tableName)}`;
      return parseInt(data[0].count);
    }
  }
}
