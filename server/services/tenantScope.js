import { isSuperAdmin } from './permissions.js';

export function isTenantUser(user) {
  return !!user && !!user.organization_id;
}

export function getTenantOrganizationId(user) {
  if (!isTenantUser(user)) return null;
  return user.organization_id;
}

export function canManageAdminRole(currentUser) {
  return isSuperAdmin(currentUser);
}

export function isUserInTenant(userRecord, organizationId) {
  if (!userRecord || !organizationId) return false;
  return userRecord.organization_id === organizationId;
}

export function isProjectInTenant(projectRecord, organizationId) {
  if (!projectRecord || !organizationId) return false;
  return projectRecord.organization_id === organizationId;
}

export function assertTenantAccess(user) {
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (!isTenantUser(user)) {
    return { ok: false, status: 403, error: 'Access denied' };
  }
  return { ok: true, organizationId: user.organization_id };
}
