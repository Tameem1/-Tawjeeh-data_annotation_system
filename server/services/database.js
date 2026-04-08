import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location — defaults to ./data/ relative to where the process is started,
// so global npm installs store data in the user's working directory, not inside node_modules.
function getDataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getDbPath() {
  return path.join(getDataDir(), 'databayt.sqlite');
}

let db = null;

/**
 * Initialize the database connection and create schema if needed
 */
export function initDatabase() {
  if (db) return db;

  const dataDir = getDataDir();
  const dbPath = getDbPath();

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log(`Initializing database at: ${dbPath}`);
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  createSchema();

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Create database schema
 */
function createSchema() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '["annotator"]',
      admin_id TEXT,
      must_change_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      admin_id TEXT NOT NULL,
      manager_id TEXT,
      xml_config TEXT,
      upload_prompt TEXT,
      custom_field_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Project annotators (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_annotators (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Data points table
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      original_annotation TEXT,
      human_annotation TEXT,
      final_annotation TEXT,
      ai_suggestions TEXT DEFAULT '{}',
      ratings TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      confidence REAL,
      upload_prompt TEXT,
      custom_field TEXT,
      custom_field_name TEXT,
      custom_field_values TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      display_metadata TEXT DEFAULT '{}',
      split TEXT,
      annotator_id TEXT,
      annotator_name TEXT,
      annotated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (annotator_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Project stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_stats (
      project_id TEXT PRIMARY KEY,
      total_accepted INTEGER DEFAULT 0,
      total_rejected INTEGER DEFAULT 0,
      total_edited INTEGER DEFAULT 0,
      total_processed INTEGER DEFAULT 0,
      average_confidence REAL DEFAULT 0,
      session_time INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      data_points TEXT NOT NULL,
      stats TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Data point comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_point_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      data_point_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      parent_comment_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (data_point_id) REFERENCES data_points(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id) REFERENCES data_point_comments(id) ON DELETE SET NULL
    )
  `);

  // Provider connections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_connections (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Model profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      default_prompt TEXT,
      temperature REAL,
      max_tokens INTEGER,
      input_price_per_million REAL,
      output_price_per_million REAL,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
    )
  `);

  // Project model policies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_model_policies (
      project_id TEXT PRIMARY KEY,
      allowed_profile_ids TEXT DEFAULT '[]',
      default_profile_ids TEXT DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Invite tokens table for user registration
  db.exec(`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      admin_id TEXT,
      default_roles TEXT DEFAULT '["annotator"]',
      max_uses INTEGER DEFAULT 0,
      current_uses INTEGER DEFAULT 0,
      expires_at INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Billing settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      contact_email TEXT,
      plan_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      start_at INTEGER NOT NULL,
      billing_anchor_at INTEGER NOT NULL,
      expires_at INTEGER,
      price_snapshot_cents INTEGER NOT NULL,
      notes TEXT,
      updated_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Payment records table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      paid_at INTEGER NOT NULL,
      recorded_by TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Demo requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      organization TEXT,
      phone TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Subscription email activity table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_email_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subscription_id TEXT,
      payment_record_id TEXT,
      email_type TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      resend_message_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
      FOREIGN KEY (payment_record_id) REFERENCES payment_records(id) ON DELETE SET NULL
    )
  `);

  // Import jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      options_json TEXT NOT NULL DEFAULT '{}',
      rows_processed INTEGER NOT NULL DEFAULT 0,
      rows_imported INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      locked_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Import staging table
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_staging_data_points (
      job_id TEXT NOT NULL,
      row_order INTEGER NOT NULL,
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      original_annotation TEXT,
      human_annotation TEXT,
      final_annotation TEXT,
      ai_suggestions TEXT DEFAULT '{}',
      ratings TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      confidence REAL,
      upload_prompt TEXT,
      custom_field TEXT,
      custom_field_name TEXT,
      custom_field_values TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      display_metadata TEXT DEFAULT '{}',
      split TEXT,
      annotator_id TEXT,
      annotator_name TEXT,
      annotated_at INTEGER,
      is_iaa INTEGER DEFAULT 0,
      assignments TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (job_id, row_order),
      FOREIGN KEY (job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_data_points_project ON data_points(project_id);
    CREATE INDEX IF NOT EXISTS idx_data_points_status ON data_points(status);
    CREATE INDEX IF NOT EXISTS idx_comments_project_data_point ON data_point_comments(project_id, data_point_id);
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON data_point_comments(created_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_annotators_user ON project_annotators(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
    CREATE INDEX IF NOT EXISTS idx_projects_admin_id ON projects(admin_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tokens_admin_id ON invite_tokens(admin_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_status_created ON import_jobs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_project_created ON import_jobs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_staging_job_order ON import_staging_data_points(job_id, row_order);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expires ON subscriptions(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_payment_records_user_paid_at ON payment_records(user_id, paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_demo_requests_status_created ON demo_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subscription_email_log_user_created ON subscription_email_log(user_id, created_at DESC);
  `);

  // Migrations — add columns if they don't exist yet
  const migrations = [
    `ALTER TABLE data_points ADD COLUMN is_iaa INTEGER DEFAULT 0`,
    `ALTER TABLE data_points ADD COLUMN assignments TEXT DEFAULT '[]'`,
    `ALTER TABLE projects ADD COLUMN iaa_config TEXT`,
    `ALTER TABLE projects ADD COLUMN guidelines TEXT`,
    `ALTER TABLE projects ADD COLUMN is_demo INTEGER DEFAULT 0`,
    `ALTER TABLE subscriptions ADD COLUMN contact_email TEXT`,
    // Task templates
    `CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Custom',
      xml_config TEXT NOT NULL,
      is_global INTEGER DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_task_templates_global ON task_templates(is_global)`,
    // QA queue columns
    `ALTER TABLE data_points ADD COLUMN qa_status TEXT DEFAULT 'pending_review'`,
    `ALTER TABLE data_points ADD COLUMN qa_reviewer_id TEXT`,
    `ALTER TABLE import_jobs ADD COLUMN rows_imported INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN admin_id TEXT`,
    `ALTER TABLE projects ADD COLUMN admin_id TEXT`,
    `ALTER TABLE invite_tokens ADD COLUMN admin_id TEXT`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* already exists */ }
  }

  // Seed default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const now = Date.now();
    const defaultHash = bcrypt.hashSync('admin', 12);
    db.prepare(`
      INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
      VALUES (?, 'admin', ?, '["super_admin","admin","manager","annotator"]', 1, ?, ?)
    `).run(crypto.randomUUID(), defaultHash, now, now);
    console.log('Created default admin user (username: admin, password: admin) — change this password immediately!');
  }

  const seedAdmin = db.prepare(`SELECT id, roles FROM users WHERE username = 'admin' LIMIT 1`).get();
  if (seedAdmin) {
    try {
      const parsedRoles = JSON.parse(seedAdmin.roles);
      const merged = Array.from(new Set(['super_admin', ...parsedRoles, 'admin', 'manager', 'annotator']));
      db.prepare('UPDATE users SET roles = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(merged), Date.now(), seedAdmin.id);
    } catch {
      db.prepare('UPDATE users SET roles = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(['super_admin', 'admin', 'manager', 'annotator']), Date.now(), seedAdmin.id);
    }
  }

  const now = Date.now();

  const adminUsers = db.prepare(`
    SELECT id, roles
    FROM users
    ORDER BY created_at ASC
  `).all();
  const nonSuperAdmins = adminUsers.filter((user) => {
    try {
      const roles = JSON.parse(user.roles);
      return Array.isArray(roles) && roles.includes('admin') && !roles.includes('super_admin');
    } catch {
      return false;
    }
  });
  const fallbackAdminId = nonSuperAdmins[0]?.id || seedAdmin?.id || null;

  if (fallbackAdminId) {
    db.prepare(`
      UPDATE users
      SET admin_id = id
      WHERE admin_id IS NULL
        AND roles LIKE '%"admin"%'
        AND roles NOT LIKE '%"super_admin"%'
    `).run();

    db.prepare(`
      UPDATE users
      SET admin_id = ?
      WHERE admin_id IS NULL
        AND (roles NOT LIKE '%"admin"%' OR roles LIKE '%"super_admin"%')
    `).run(fallbackAdminId);

    db.prepare(`
      UPDATE projects
      SET admin_id = COALESCE(
        (SELECT CASE
          WHEN manager_id IS NOT NULL THEN
            (SELECT CASE
              WHEN roles LIKE '%"admin"%' AND roles NOT LIKE '%"super_admin"%' THEN id
              ELSE admin_id
            END
            FROM users
            WHERE id = projects.manager_id)
          ELSE NULL
        END),
        ?
      )
      WHERE admin_id IS NULL
    `).run(fallbackAdminId);

    db.prepare(`
      UPDATE invite_tokens
      SET admin_id = COALESCE(
        (SELECT CASE
          WHEN roles LIKE '%"admin"%' AND roles NOT LIKE '%"super_admin"%' THEN id
          ELSE admin_id
        END
        FROM users
        WHERE id = invite_tokens.created_by),
        ?
      )
      WHERE admin_id IS NULL
    `).run(fallbackAdminId);
  }

  const upsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  upsertSetting.run('calendly_url', '', now);
  upsertSetting.run('resend_from_email', '', now);
  upsertSetting.run('billing_reply_to_email', '', now);
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { initDatabase, getDatabase, closeDatabase };
