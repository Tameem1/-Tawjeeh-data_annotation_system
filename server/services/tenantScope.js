import { isSuperAdmin } from './permissions.js';

export function getTenantAdminId(user) {
  if (!user) return null;
  if (isSuperAdmin(user)) return null;
  if (user.roles?.includes('admin')) return user.id;
  return user.admin_id || null;
}

export function canManageAdminRole(currentUser) {
  return isSuperAdmin(currentUser);
}

export function isUserInTenant(userRecord, tenantAdminId) {
  if (!userRecord) return false;
  if (tenantAdminId == null) return true;
  if (userRecord.roles?.includes?.('admin')) {
    return userRecord.id === tenantAdminId;
  }
  return userRecord.admin_id === tenantAdminId;
}

export function isProjectInTenant(projectRecord, tenantAdminId) {
  if (!projectRecord) return false;
  if (tenantAdminId == null) return true;
  return projectRecord.admin_id === tenantAdminId;
}
