import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../services/database.js';

let dataDir = null;

afterEach(() => {
  closeDatabase();
  if (dataDir) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
  delete process.env.DATA_DIR;
});

describe('database bootstrap', () => {
  it('creates an organization workspace for the default super admin', () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tawjeeh-db-'));
    process.env.DATA_DIR = dataDir;

    const db = initDatabase();
    const admin = db
      .prepare("SELECT id, admin_id, organization_id FROM users WHERE username = 'admin'")
      .get();

    expect(admin.organization_id).toBeTruthy();
    expect(admin.admin_id).toBe(admin.id);

    const organization = db
      .prepare('SELECT owner_admin_user_id FROM organizations WHERE id = ?')
      .get(admin.organization_id);

    expect(organization.owner_admin_user_id).toBe(admin.id);
  });
});
