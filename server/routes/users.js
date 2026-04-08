import { getDatabase } from '../services/database.js';
import { generateToken } from '../middleware/auth.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getUserAccessState } from '../services/billingService.js';
import { assertRoles, isSuperAdmin, normalizeRoles } from '../services/permissions.js';
import { assertTenantAccess, canManageAdminRole, getTenantOrganizationId, isTenantUser, isUserInTenant } from '../services/tenantScope.js';

const BCRYPT_ROUNDS = 12;

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 5;
}

function sanitizeRoles(roles) {
    return assertRoles(roles);
}

const DEMO_XML_CONFIG = `<annotation-config>
  <field id="sentiment" type="dropdown" required="true">
    <label>Sentiment</label>
    <options>
      <option value="positive">Positive</option>
      <option value="negative">Negative</option>
      <option value="neutral">Neutral</option>
    </options>
  </field>
</annotation-config>`;

const DEMO_DATA_POINTS = [
    { content: "The product quality is outstanding! It exceeded all my expectations.", original_annotation: "positive" },
    { content: "I've been waiting for 3 weeks and still no delivery. Terrible service.", original_annotation: "negative" },
    { content: "The package arrived on time. Nothing special, just standard quality.", original_annotation: "neutral" },
    { content: "Absolutely love this! Best purchase I've made this year.", original_annotation: "positive" },
    { content: "The item broke after two days of use. Very disappointing.", original_annotation: "negative" },
    { content: "It does what it says on the box. Works as expected.", original_annotation: "neutral" },
    { content: "Customer support was incredibly helpful and resolved my issue immediately.", original_annotation: "positive" },
    { content: "The instructions were confusing and the setup took way too long.", original_annotation: "negative" },
    { content: "Average product — nothing to complain about but nothing impressive either.", original_annotation: "neutral" },
    { content: "Highly recommend! Great value for money and fast shipping.", original_annotation: "positive" },
];

/**
 * Creates a demo practice project with sample data for a new user.
 * The project is a sentiment analysis task so the user can explore the workspace.
 */
function createDemoProject(db, userId, username, roles, adminId, organizationId) {
    try {
        const projectId = crypto.randomUUID();
        const now = Date.now();
        const isManagerOrAdmin = roles.includes('admin') || roles.includes('manager');

        db.prepare(`
            INSERT INTO projects (id, name, description, admin_id, organization_id, manager_id, xml_config, guidelines, is_demo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
            projectId,
            'Practice Project — Sentiment Analysis',
            'A sample project to help you get started. Practice accepting, rejecting, and editing AI-suggested sentiment labels on product reviews.',
            adminId,
            organizationId,
            isManagerOrAdmin ? userId : null,
            DEMO_XML_CONFIG,
            'Label each product review with the correct sentiment:\n- **Positive** — the customer is satisfied or happy\n- **Negative** — the customer is dissatisfied or unhappy\n- **Neutral** — the customer is neither positive nor negative\n\nYou can accept the AI suggestion, reject it, or edit it to the correct label.',
            now,
            now
        );

        // Assign user as annotator
        db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)').run(projectId, userId);

        // Initialize stats
        db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(projectId);

        // Insert demo data points
        const insertPoint = db.prepare(`
            INSERT INTO data_points (id, project_id, content, type, original_annotation, status, created_at, updated_at)
            VALUES (?, ?, ?, 'text', ?, 'pending', ?, ?)
        `);
        for (const point of DEMO_DATA_POINTS) {
            insertPoint.run(crypto.randomUUID(), projectId, point.content, point.original_annotation, now, now);
        }

        console.log(`Created demo project for new user: ${username}`);
    } catch (err) {
        // Non-fatal — log but don't break user creation
        console.error('Failed to create demo project for user:', err);
    }
}

/**
 * Users API routes
 */
export function registerUserRoutes(app) {
    const db = getDatabase();
    const createOrganizationForAdmin = (adminUserId, username) => {
        const existing = db.prepare('SELECT id FROM organizations WHERE owner_admin_user_id = ?').get(adminUserId);
        if (existing?.id) {
            db.prepare('UPDATE users SET organization_id = ?, updated_at = ? WHERE id = ?')
                .run(existing.id, Date.now(), adminUserId);
            return existing.id;
        }

        const organizationId = crypto.randomUUID();
        const now = Date.now();
        db.prepare(`
            INSERT INTO organizations (id, name, owner_admin_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(organizationId, `${username}'s Organization`, adminUserId, now, now);
        db.prepare('UPDATE users SET organization_id = ?, updated_at = ? WHERE id = ?')
            .run(organizationId, now, adminUserId);
        return organizationId;
    };

    const mapUser = (user) => ({
        id: user.id,
        username: user.username,
        roles: normalizeRoles(JSON.parse(user.roles)),
        adminId: user.admin_id ?? null,
        organizationId: user.organization_id ?? null,
        mustChangePassword: !!user.must_change_password,
        createdAt: user.created_at,
        updatedAt: user.updated_at
    });

    const getScopedUsers = (currentUser) => {
        const organizationId = getTenantOrganizationId(currentUser);
        return db.prepare(`
            SELECT id, username, roles, admin_id, organization_id, must_change_password, created_at, updated_at
            FROM users
            WHERE organization_id = ?
            ORDER BY created_at DESC
        `).all(organizationId);
    };

    // Get all users (admin or manager only)
    app.get('/api/users', (req, res) => {
        try {
            const user = req.user;
            const tenantAccess = assertTenantAccess(user);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }

            // Allow admin and manager to see user list
            if (!user.roles?.includes('admin') && !user.roles?.includes('manager')) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const users = getScopedUsers(user);
            res.json(users.map(mapUser));
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // Get single user
    app.get('/api/users/:id', (req, res) => {
        try {
            const currentUser = req.user;
            const tenantAccess = assertTenantAccess(currentUser);
            if (!tenantAccess.ok) {
                return res.status(tenantAccess.status).json({ error: tenantAccess.error });
            }
            const { id } = req.params;
            const user = db.prepare('SELECT id, username, roles, admin_id, organization_id, must_change_password, created_at, updated_at FROM users WHERE id = ?').get(id);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const normalizedRoles = normalizeRoles(JSON.parse(user.roles));
            const canRead = currentUser?.id === id
                || currentUser?.roles?.includes('admin')
                || currentUser?.roles?.includes('manager');

            if (!canRead || !isUserInTenant({ ...user, roles: normalizedRoles }, tenantAccess.organizationId)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(mapUser(user));
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    });

    // Create user (admin only)
    app.post('/api/users', async (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { username, password, roles = ['annotator'], mustChangePassword = true } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            if (!isValidPassword(password)) {
                return res.status(400).json({ error: 'Password must be at least 5 characters' });
            }

            const sanitized = sanitizeRoles(roles);
            if ((sanitized.includes('admin') || sanitized.includes('super_admin')) && !canManageAdminRole(currentUser)) {
                return res.status(403).json({ error: 'Only a super admin can create admin accounts' });
            }
            if (isSuperAdmin(currentUser) && !sanitized.includes('admin')) {
                return res.status(403).json({ error: 'Super admin can only create organization admin accounts' });
            }
            if (roles?.includes?.('super_admin') && !isSuperAdmin(currentUser)) {
                return res.status(403).json({ error: 'Only a super admin can assign the super_admin role' });
            }
            if (sanitized.length === 0) {
                return res.status(400).json({ error: 'At least one valid role is required' });
            }

            if (!canManageAdminRole(currentUser)) {
                const tenantAccess = assertTenantAccess(currentUser);
                if (!tenantAccess.ok) {
                    return res.status(tenantAccess.status).json({ error: tenantAccess.error });
                }
            }

            // Check if username already exists
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            const id = crypto.randomUUID();
            const now = Date.now();
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const adminId = sanitized.includes('admin') && !sanitized.includes('super_admin')
                ? id
                : (currentUser.admin_id || currentUser.id);
            const organizationId = sanitized.includes('admin') && !sanitized.includes('super_admin')
                ? null
                : getTenantOrganizationId(currentUser);

            db.prepare(`
        INSERT INTO users (id, username, password, roles, admin_id, organization_id, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, passwordHash, JSON.stringify(sanitized), adminId, organizationId, mustChangePassword ? 1 : 0, now, now);

            const resolvedOrganizationId = sanitized.includes('admin') && !sanitized.includes('super_admin')
                ? createOrganizationForAdmin(id, username)
                : organizationId;

            createDemoProject(db, id, username, sanitized, adminId, resolvedOrganizationId);

            res.status(201).json({
                id,
                username,
                roles: sanitized,
                adminId,
                organizationId: resolvedOrganizationId,
                mustChangePassword,
                createdAt: now,
                updatedAt: now
            });
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });

    // Update user
    app.put('/api/users/:id', async (req, res) => {
        try {
            const currentUser = req.user;
            const { id } = req.params;
            const { password, roles, mustChangePassword } = req.body;

            // Only admin can change roles, users can change their own password
            const isAdmin = currentUser?.roles?.includes('admin') && isTenantUser(currentUser);
            const isSelf = currentUser?.id === id;

            if (!isAdmin && !isSelf) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Non-admin can only change their own password
            if (!isAdmin && roles !== undefined) {
                return res.status(403).json({ error: 'Only admin can change roles' });
            }

            const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            if (!existing) {
                return res.status(404).json({ error: 'User not found' });
            }

            const existingRoles = normalizeRoles(JSON.parse(existing.roles));
            const tenantOrganizationId = getTenantOrganizationId(currentUser);
            if (!isSelf && (!isUserInTenant({ ...existing, roles: existingRoles }, tenantOrganizationId) || (existingRoles.includes('admin') && !canManageAdminRole(currentUser)))) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const now = Date.now();
            const updates = [];
            const values = [];

            if (password !== undefined) {
                if (!isValidPassword(password)) {
                    return res.status(400).json({ error: 'Password must be at least 5 characters' });
                }
                const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
                updates.push('password = ?');
                values.push(passwordHash);
            }
            if (roles !== undefined && isAdmin) {
                if (roles?.includes?.('super_admin') && !isSuperAdmin(currentUser)) {
                    return res.status(403).json({ error: 'Only a super admin can assign the super_admin role' });
                }
                const sanitized = sanitizeRoles(roles);
                if ((sanitized.includes('admin') || sanitized.includes('super_admin')) && !canManageAdminRole(currentUser)) {
                    return res.status(403).json({ error: 'Only a super admin can assign the admin role' });
                }
                updates.push('roles = ?');
                values.push(JSON.stringify(sanitized));

                if (sanitized.includes('admin') && !sanitized.includes('super_admin')) {
                    updates.push('admin_id = ?');
                    values.push(id);
                    const organizationId = createOrganizationForAdmin(id, existing.username);
                    updates.push('organization_id = ?');
                    values.push(organizationId);
                } else if (!sanitized.includes('admin')) {
                    updates.push('admin_id = ?');
                    values.push(existing.admin_id || currentUser.admin_id || currentUser.id);
                    updates.push('organization_id = ?');
                    values.push(existing.organization_id || tenantOrganizationId || null);
                }
            }
            if (mustChangePassword !== undefined) {
                updates.push('must_change_password = ?');
                values.push(mustChangePassword ? 1 : 0);
            }

            if (updates.length > 0) {
                updates.push('updated_at = ?');
                values.push(now);
                values.push(id);

                db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
            }

            res.json({ success: true, updatedAt: now });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });

    // Delete user (admin only)
    app.delete('/api/users/:id', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;

            // Prevent deleting yourself
            if (currentUser.id === id) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }

            const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            if (!existing) {
                return res.status(404).json({ error: 'User not found' });
            }

            const existingRoles = normalizeRoles(JSON.parse(existing.roles));
            const tenantOrganizationId = getTenantOrganizationId(currentUser);
            if (!isUserInTenant({ ...existing, roles: existingRoles }, tenantOrganizationId) || (existingRoles.includes('admin') && !canManageAdminRole(currentUser))) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });

    // Auth routes
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

            if (!user) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            let passwordValid = false;

            // Migrate plaintext passwords on first login
            if (!user.password.startsWith('$2')) {
                // Legacy plaintext comparison
                if (user.password === password) {
                    passwordValid = true;
                    // Re-hash and store securely
                    const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
                    db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?')
                        .run(newHash, Date.now(), user.id);
                }
            } else {
                passwordValid = await bcrypt.compare(password, user.password);
            }

            if (!passwordValid) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const roles = normalizeRoles(JSON.parse(user.roles));
            const token = generateToken({ id: user.id, username: user.username, roles });
            const accessState = getUserAccessState({ id: user.id, username: user.username, roles });

            res.json({
                token,
                id: user.id,
                username: user.username,
                roles,
                adminId: user.admin_id ?? null,
                organizationId: user.organization_id ?? null,
                mustChangePassword: !!user.must_change_password,
                hasActiveAccess: accessState.hasActiveAccess,
                accessStatus: accessState.accessStatus,
                accessReason: accessState.reason,
                subscriptionSummary: accessState.subscriptionSummary
            });
        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // Get current user (validates JWT)
    app.get('/api/auth/me', (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = db.prepare('SELECT id, username, roles, admin_id, organization_id, must_change_password FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const normalizedRoles = normalizeRoles(JSON.parse(user.roles));
        const accessState = getUserAccessState({
            id: user.id,
            username: user.username,
            roles: normalizedRoles
        });

        res.json({
            id: user.id,
            username: user.username,
            roles: normalizedRoles,
            adminId: user.admin_id ?? null,
            organizationId: user.organization_id ?? null,
            mustChangePassword: !!user.must_change_password,
            hasActiveAccess: accessState.hasActiveAccess,
            accessStatus: accessState.accessStatus,
            accessReason: accessState.reason,
            subscriptionSummary: accessState.subscriptionSummary
        });
    });

    // ========== Invite Token Routes ==========

    // Generate invite token (admin only)
    app.post('/api/invite', (req, res) => {
        try {
            const currentUser = req.user;
            const tenantAccess = assertTenantAccess(currentUser);
            if (!tenantAccess.ok || !currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const {
                roles = ['annotator'],
                maxUses = 0,  // 0 = unlimited
                expiresInDays = 0  // 0 = never expires
            } = req.body;

            const sanitized = sanitizeRoles(roles);
            const id = crypto.randomUUID();
            const token = crypto.randomUUID().replace(/-/g, '');  // Clean token without dashes
            const now = Date.now();
            const expiresAt = expiresInDays > 0 ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;
            const adminId = currentUser.admin_id || currentUser.id;
            const organizationId = tenantAccess.organizationId;

            db.prepare(`
                INSERT INTO invite_tokens (id, token, created_by, admin_id, organization_id, default_roles, max_uses, current_uses, expires_at, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
            `).run(id, token, currentUser.id, adminId, organizationId, JSON.stringify(sanitized), maxUses, expiresAt, now);

            res.status(201).json({
                id,
                token,
                inviteUrl: `/signup?token=${token}`,
                roles: sanitized,
                maxUses,
                adminId,
                organizationId,
                expiresAt,
                createdAt: now
            });
        } catch (error) {
            console.error('Error generating invite token:', error);
            res.status(500).json({ error: 'Failed to generate invite token' });
        }
    });

    // Get all invite tokens (admin only)
    app.get('/api/invite', (req, res) => {
        try {
            const currentUser = req.user;
            const tenantAccess = assertTenantAccess(currentUser);
            if (!tenantAccess.ok || !currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const tokens = db.prepare(`
                SELECT t.*, u.username as created_by_name
                FROM invite_tokens t
                LEFT JOIN users u ON t.created_by = u.id
                WHERE t.organization_id = ?
                ORDER BY t.created_at DESC
            `).all(tenantAccess.organizationId);

            res.json(tokens.map(t => ({
                id: t.id,
                token: t.token,
                inviteUrl: `/signup?token=${t.token}`,
                roles: JSON.parse(t.default_roles),
                maxUses: t.max_uses,
                currentUses: t.current_uses,
                adminId: t.admin_id ?? null,
                organizationId: t.organization_id ?? null,
                expiresAt: t.expires_at,
                isActive: !!t.is_active,
                createdBy: t.created_by,
                createdByName: t.created_by_name,
                createdAt: t.created_at
            })));
        } catch (error) {
            console.error('Error fetching invite tokens:', error);
            res.status(500).json({ error: 'Failed to fetch invite tokens' });
        }
    });

    // Validate invite token (public)
    app.get('/api/invite/:token/validate', (req, res) => {
        try {
            const { token } = req.params;

            const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);

            if (!invite) {
                return res.status(404).json({ valid: false, error: 'Invalid invite token' });
            }

            if (!invite.is_active) {
                return res.status(410).json({ valid: false, error: 'This invite link has been deactivated' });
            }

            if (invite.expires_at && Date.now() > invite.expires_at) {
                return res.status(410).json({ valid: false, error: 'This invite link has expired' });
            }

            if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) {
                return res.status(410).json({ valid: false, error: 'This invite link has reached its maximum uses' });
            }

            res.json({
                valid: true,
                roles: JSON.parse(invite.default_roles),
                adminId: invite.admin_id ?? null,
                organizationId: invite.organization_id ?? null
            });
        } catch (error) {
            console.error('Error validating invite token:', error);
            res.status(500).json({ valid: false, error: 'Failed to validate invite token' });
        }
    });

    // Signup with invite token (public)
    app.post('/api/auth/signup', async (req, res) => {
        try {
            const { username, password, token } = req.body;

            if (!username || !password || !token) {
                return res.status(400).json({ error: 'Username, password, and invite token are required' });
            }

            if (!isValidPassword(password)) {
                return res.status(400).json({ error: 'Password must be at least 5 characters' });
            }

            // Validate token
            const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);

            if (!invite) {
                return res.status(404).json({ error: 'Invalid invite token' });
            }

            if (!invite.is_active) {
                return res.status(410).json({ error: 'This invite link has been deactivated' });
            }

            if (invite.expires_at && Date.now() > invite.expires_at) {
                return res.status(410).json({ error: 'This invite link has expired' });
            }

            if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) {
                return res.status(410).json({ error: 'This invite link has reached its maximum uses' });
            }

            // Check if username already exists
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            // Create user
            const userId = crypto.randomUUID();
            const now = Date.now();
            const roles = normalizeRoles(JSON.parse(invite.default_roles));
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const adminId = invite.admin_id || invite.created_by;
            const organizationId = invite.organization_id
                || db.prepare('SELECT organization_id FROM users WHERE id = ?').get(adminId)?.organization_id
                || null;

            db.prepare(`
                INSERT INTO users (id, username, password, roles, admin_id, organization_id, must_change_password, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            `).run(userId, username, passwordHash, invite.default_roles, adminId, organizationId, now, now);

            // Increment invite usage
            db.prepare('UPDATE invite_tokens SET current_uses = current_uses + 1 WHERE id = ?').run(invite.id);

            createDemoProject(db, userId, username, roles, adminId, organizationId);

            const jwtToken = generateToken({ id: userId, username, roles });

            const accessState = getUserAccessState({
                id: userId,
                username,
                roles
            });

            res.status(201).json({
                token: jwtToken,
                id: userId,
                username,
                roles,
                adminId,
                organizationId,
                mustChangePassword: false,
                hasActiveAccess: accessState.hasActiveAccess,
                accessStatus: accessState.accessStatus,
                accessReason: accessState.reason,
                subscriptionSummary: accessState.subscriptionSummary
            });
        } catch (error) {
            console.error('Error during signup:', error);
            res.status(500).json({ error: 'Signup failed' });
        }
    });

    // Deactivate/reactivate invite token (admin only)
    app.patch('/api/invite/:id', (req, res) => {
        try {
            const currentUser = req.user;
            const tenantAccess = assertTenantAccess(currentUser);
            if (!tenantAccess.ok || !currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;
            const { isActive } = req.body;
            const invite = db.prepare('SELECT * FROM invite_tokens WHERE id = ?').get(id);
            if (!invite) {
                return res.status(404).json({ error: 'Invite token not found' });
            }
            if (invite.organization_id !== tenantAccess.organizationId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const result = db.prepare('UPDATE invite_tokens SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Invite token not found' });
            }

            res.json({ success: true, isActive });
        } catch (error) {
            console.error('Error updating invite token:', error);
            res.status(500).json({ error: 'Failed to update invite token' });
        }
    });

    // Delete invite token (admin only)
    app.delete('/api/invite/:id', (req, res) => {
        try {
            const currentUser = req.user;
            const tenantAccess = assertTenantAccess(currentUser);
            if (!tenantAccess.ok || !currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;
            const invite = db.prepare('SELECT * FROM invite_tokens WHERE id = ?').get(id);
            if (!invite) {
                return res.status(404).json({ error: 'Invite token not found' });
            }
            if (invite.organization_id !== tenantAccess.organizationId) {
                return res.status(403).json({ error: 'Access denied' });
            }
            const result = db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Invite token not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting invite token:', error);
            res.status(500).json({ error: 'Failed to delete invite token' });
        }
    });
}

export default { registerUserRoutes };
