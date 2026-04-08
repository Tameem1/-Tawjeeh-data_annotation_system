import { randomUUID } from 'crypto';
import { getDatabase } from '../services/database.js';
import { requireAuth } from '../middleware/auth.js';
import { assertTenantAccess } from '../services/tenantScope.js';

export function registerTemplateRoutes(app) {
    // GET /api/templates — return user-created templates (frontend merges built-ins)
    app.get('/api/templates', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const db = getDatabase();
            const rows = db.prepare(
                `SELECT * FROM task_templates WHERE organization_id = ? ORDER BY created_at DESC`
            ).all(tenantAccess.organizationId);

            const templates = rows.map(row => ({
                id: row.id,
                name: row.name,
                description: row.description || undefined,
                category: row.category,
                xmlConfig: row.xml_config,
                isGlobal: row.is_global === 1,
                createdBy: row.created_by || undefined,
                createdAt: row.created_at,
            }));

            res.json(templates);
        } catch (err) {
            console.error('GET /api/templates error:', err);
            res.status(500).json({ error: 'Failed to fetch templates' });
        }
    });

    // POST /api/templates — save a new user template
    app.post('/api/templates', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Admin or manager access required' });
            }
            const { name, description, category, xmlConfig } = req.body;

            if (!name?.trim()) {
                return res.status(400).json({ error: 'name is required' });
            }
            if (!xmlConfig?.trim()) {
                return res.status(400).json({ error: 'xmlConfig is required' });
            }

            const db = getDatabase();
            const id = randomUUID();
            const now = Date.now();

            db.prepare(
                `INSERT INTO task_templates (id, name, description, category, xml_config, is_global, created_by, organization_id, created_at)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
            ).run(id, name.trim(), description?.trim() || null, (category?.trim() || 'Custom'), xmlConfig.trim(), req.user.id, tenantAccess.organizationId, now);

            res.status(201).json({
                id,
                name: name.trim(),
                description: description?.trim() || undefined,
                category: category?.trim() || 'Custom',
                xmlConfig: xmlConfig.trim(),
                isGlobal: false,
                createdBy: req.user.id,
                createdAt: now,
            });
        } catch (err) {
            console.error('POST /api/templates error:', err);
            res.status(500).json({ error: 'Failed to create template' });
        }
    });

    // DELETE /api/templates/:id — only creator or admin can delete; built-ins are undeletable
    app.delete('/api/templates/:id', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const db = getDatabase();
            const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(req.params.id);

            if (!row) return res.status(404).json({ error: 'Template not found' });
            if (row.is_global === 1) return res.status(403).json({ error: 'Built-in templates cannot be deleted' });

            if (row.organization_id !== tenantAccess.organizationId) {
                return res.status(403).json({ error: 'Not authorised' });
            }
            const canManage = req.user.roles?.includes('admin') || req.user.roles?.includes('manager');
            if (!canManage) {
                return res.status(403).json({ error: 'Not authorised' });
            }

            db.prepare('DELETE FROM task_templates WHERE id = ?').run(req.params.id);
            res.json({ success: true });
        } catch (err) {
            console.error('DELETE /api/templates/:id error:', err);
            res.status(500).json({ error: 'Failed to delete template' });
        }
    });
}
