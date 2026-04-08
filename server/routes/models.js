import { getDatabase } from '../services/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import crypto from 'crypto';
import { assertTenantAccess, getTenantOrganizationId } from '../services/tenantScope.js';

function maskApiKey(key) {
    if (!key) return null;
    if (key.length <= 8) return '••••••••';
    return '••••' + key.slice(-4);
}

/**
 * Model management API routes
 */
export function registerModelRoutes(app) {
    const db = getDatabase();
    const toOptionalNumber = (value) => (
        typeof value === 'number' && Number.isFinite(value) ? value : undefined
    );
    const toNullableNumber = (value) => (
        typeof value === 'number' && Number.isFinite(value) ? value : null
    );

    // Provider Connections — admin only for write, requireAuth for read
    app.get('/api/connections', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const connections = db.prepare('SELECT * FROM provider_connections WHERE organization_id = ? ORDER BY created_at DESC').all(tenantAccess.organizationId);

            res.json(connections.map(c => ({
                id: c.id,
                providerId: c.provider_id,
                name: c.name,
                apiKeyMasked: maskApiKey(c.api_key),
                hasApiKey: !!c.api_key,
                baseUrl: c.base_url,
                isActive: !!c.is_active,
                createdAt: c.created_at,
                updatedAt: c.updated_at
            })));
        } catch (error) {
            console.error('Error fetching connections:', error);
            res.status(500).json({ error: 'Failed to fetch connections' });
        }
    });

    app.post('/api/connections', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Admin or manager access required' });
            }
            const { id, providerId, name, apiKey, baseUrl, isActive = true } = req.body;

            if (!providerId || !name) {
                return res.status(400).json({ error: 'Provider and name are required' });
            }

            const connectionId = id || crypto.randomUUID();
            const now = Date.now();
            const existing = id
                ? db.prepare('SELECT api_key, created_at, organization_id FROM provider_connections WHERE id = ?').get(id)
                : null;
            if (existing && existing.organization_id !== tenantAccess.organizationId) {
                return res.status(403).json({ error: 'Access denied' });
            }
            const resolvedApiKey = apiKey === undefined
                ? (existing?.api_key ?? null)
                : (apiKey || null);
            const createdAt = existing?.created_at || now;

            db.prepare(`
        INSERT INTO provider_connections (id, organization_id, provider_id, name, api_key, base_url, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          provider_id = excluded.provider_id,
          name = excluded.name,
          api_key = excluded.api_key,
          base_url = excluded.base_url,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).run(connectionId, tenantAccess.organizationId, providerId, name, resolvedApiKey, baseUrl || null, isActive ? 1 : 0, createdAt, now);

            res.status(201).json({ id: connectionId, createdAt, updatedAt: now });
        } catch (error) {
            console.error('Error saving connection:', error);
            res.status(500).json({ error: 'Failed to save connection' });
        }
    });

    app.delete('/api/connections/:id', requireAuth, (req, res) => {
        try {
            const { id } = req.params;
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Admin or manager access required' });
            }
            db.prepare('DELETE FROM provider_connections WHERE id = ? AND organization_id = ?').run(id, tenantAccess.organizationId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting connection:', error);
            res.status(500).json({ error: 'Failed to delete connection' });
        }
    });

    // Model Profiles
    app.get('/api/profiles', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const profiles = db.prepare('SELECT * FROM model_profiles WHERE organization_id = ? ORDER BY created_at DESC').all(tenantAccess.organizationId);

            res.json(profiles.map(p => ({
                id: p.id,
                providerConnectionId: p.connection_id,
                modelId: p.model_id,
                displayName: p.display_name,
                defaultPrompt: p.default_prompt,
                temperature: toOptionalNumber(p.temperature),
                maxTokens: toOptionalNumber(p.max_tokens),
                inputPricePerMillion: toOptionalNumber(p.input_price_per_million),
                outputPricePerMillion: toOptionalNumber(p.output_price_per_million),
                isActive: !!p.is_active,
                createdAt: p.created_at,
                updatedAt: p.updated_at
            })));
        } catch (error) {
            console.error('Error fetching profiles:', error);
            res.status(500).json({ error: 'Failed to fetch profiles' });
        }
    });

    app.post('/api/profiles', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Admin or manager access required' });
            }
            const {
                id,
                providerConnectionId,
                modelId,
                displayName,
                defaultPrompt,
                temperature,
                maxTokens,
                inputPricePerMillion,
                outputPricePerMillion,
                isActive = true
            } = req.body;

            if (!providerConnectionId || !modelId || !displayName) {
                return res.status(400).json({ error: 'Connection, model, and display name are required' });
            }

            const profileId = id || crypto.randomUUID();
            const now = Date.now();
            const connection = db.prepare('SELECT id, organization_id FROM provider_connections WHERE id = ?').get(providerConnectionId);
            if (!connection || connection.organization_id !== tenantAccess.organizationId) {
                return res.status(400).json({ error: 'Connection not found in this organization' });
            }
            const existing = id
                ? db.prepare('SELECT organization_id FROM model_profiles WHERE id = ?').get(id)
                : null;
            if (existing && existing.organization_id !== tenantAccess.organizationId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            db.prepare(`
        INSERT INTO model_profiles (
          id, organization_id, connection_id, model_id, display_name, default_prompt, temperature, max_tokens,
          input_price_per_million, output_price_per_million, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          connection_id = excluded.connection_id,
          model_id = excluded.model_id,
          display_name = excluded.display_name,
          default_prompt = excluded.default_prompt,
          temperature = excluded.temperature,
          max_tokens = excluded.max_tokens,
          input_price_per_million = excluded.input_price_per_million,
          output_price_per_million = excluded.output_price_per_million,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).run(
                profileId,
                tenantAccess.organizationId,
                providerConnectionId,
                modelId,
                displayName,
                defaultPrompt || null,
                toNullableNumber(temperature),
                toNullableNumber(maxTokens),
                toNullableNumber(inputPricePerMillion),
                toNullableNumber(outputPricePerMillion),
                isActive ? 1 : 0,
                now,
                now
            );

            res.status(201).json({ id: profileId, createdAt: now, updatedAt: now });
        } catch (error) {
            console.error('Error saving profile:', error);
            res.status(500).json({ error: 'Failed to save profile' });
        }
    });

    app.delete('/api/profiles/:id', requireAuth, (req, res) => {
        try {
            const { id } = req.params;
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Admin or manager access required' });
            }
            db.prepare('DELETE FROM model_profiles WHERE id = ? AND organization_id = ?').run(id, tenantAccess.organizationId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting profile:', error);
            res.status(500).json({ error: 'Failed to delete profile' });
        }
    });

    // Project Model Policies
    app.get('/api/policies/:projectId', requireAuth, (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const { projectId } = req.params;
            const project = db.prepare('SELECT id FROM projects WHERE id = ? AND organization_id = ?').get(projectId, tenantAccess.organizationId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }
            const policy = db.prepare('SELECT * FROM project_model_policies WHERE project_id = ?').get(projectId);

            if (!policy) {
                return res.json({
                    projectId,
                    allowedModelProfileIds: [],
                    defaultModelProfileIds: [],
                    updatedAt: null
                });
            }

            res.json({
                projectId: policy.project_id,
                allowedModelProfileIds: JSON.parse(policy.allowed_profile_ids || '[]'),
                defaultModelProfileIds: JSON.parse(policy.default_profile_ids || '[]'),
                updatedAt: policy.updated_at
            });
        } catch (error) {
            console.error('Error fetching policy:', error);
            res.status(500).json({ error: 'Failed to fetch policy' });
        }
    });

    app.put('/api/policies/:projectId', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
        try {
            const tenantAccess = assertTenantAccess(req.user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const { projectId } = req.params;
            const { allowedModelProfileIds = [], defaultModelProfileIds = [] } = req.body;
            const now = Date.now();
            const project = db.prepare('SELECT id FROM projects WHERE id = ? AND organization_id = ?').get(projectId, tenantAccess.organizationId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }
            const profileIds = [...allowedModelProfileIds, ...defaultModelProfileIds];
            if (profileIds.length > 0) {
                const placeholders = profileIds.map(() => '?').join(', ');
                const rows = db.prepare(`
                    SELECT id FROM model_profiles
                    WHERE organization_id = ? AND id IN (${placeholders})
                `).all(tenantAccess.organizationId, ...profileIds);
                if (rows.length !== new Set(profileIds).size) {
                    return res.status(400).json({ error: 'One or more profiles are outside this organization' });
                }
            }

            db.prepare(`
        INSERT INTO project_model_policies (project_id, organization_id, allowed_profile_ids, default_profile_ids, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          organization_id = excluded.organization_id,
          allowed_profile_ids = excluded.allowed_profile_ids,
          default_profile_ids = excluded.default_profile_ids,
          updated_at = excluded.updated_at
      `).run(
                projectId,
                tenantAccess.organizationId,
                JSON.stringify(allowedModelProfileIds),
                JSON.stringify(defaultModelProfileIds),
                now
            );

            res.json({ success: true, updatedAt: now });
        } catch (error) {
            console.error('Error saving policy:', error);
            res.status(500).json({ error: 'Failed to save policy' });
        }
    });
}

export default { registerModelRoutes };
