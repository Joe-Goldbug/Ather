// apps/api/src/modules/audit/audit.service.ts
// Audit module — Phase 7
// Read-only access to audit_logs table (writes done via DB triggers)

import { Injectable } from '@nestjs/common';
import { Database } from '../../common/database.js';

@Injectable()
export class AuditService {
  constructor(private readonly db: Database) {}

  /** Get audit logs for a specific user */
  async getByUser(userId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await this.db.pool.query(
      `SELECT id, table_name, record_id, action, old_data, new_data, performed_by, performed_at
       FROM audit_logs
       WHERE performed_by = $1
       ORDER BY performed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    const count = await this.db.pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE performed_by = $1',
      [userId],
    );
    return {
      data: rows.rows,
      total: parseInt(count.rows[0].count, 10),
      page,
      limit,
    };
  }

  /** Get audit logs for a specific table and record — scoped to owner */
  async getByRecord(tableName: string, recordId: string, userId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await this.db.pool.query(
      `SELECT id, table_name, record_id, action, old_data, new_data, performed_by, performed_at
       FROM audit_logs
       WHERE table_name = $1 AND record_id = $2 AND performed_by = $3
       ORDER BY performed_at DESC
       LIMIT $4 OFFSET $5`,
      [tableName, recordId, userId, limit, offset],
    );
    const count = await this.db.pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE table_name = $1 AND record_id = $2 AND performed_by = $3',
      [tableName, recordId, userId],
    );
    return {
      data: rows.rows,
      total: parseInt(count.rows[0].count, 10),
      page,
      limit,
    };
  }

  /** Get audit logs for a table — scoped to owner */
  async getByTable(tableName: string, userId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await this.db.pool.query(
      `SELECT id, table_name, record_id, action, old_data, new_data, performed_by, performed_at
       FROM audit_logs
       WHERE table_name = $1 AND performed_by = $2
       ORDER BY performed_at DESC
       LIMIT $3 OFFSET $4`,
      [tableName, userId, limit, offset],
    );
    const count = await this.db.pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM audit_logs WHERE table_name = $1 AND performed_by = $2',
      [tableName, userId],
    );
    return {
      data: rows.rows,
      total: parseInt(count.rows[0].count, 10),
      page,
      limit,
    };
  }
}