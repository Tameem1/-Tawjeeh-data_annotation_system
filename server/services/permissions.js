const ALLOWED_ROLES = ['super_admin', 'admin', 'manager', 'annotator'];

export function normalizeRoles(roles) {
  const source = Array.isArray(roles) ? roles : [];
  const set = new Set(source.filter((role) => ALLOWED_ROLES.includes(role)));

  if (set.has('super_admin')) {
    set.add('admin');
    set.add('manager');
    set.add('annotator');
  } else if (set.has('admin')) {
    set.add('manager');
    set.add('annotator');
  }

  return ALLOWED_ROLES.filter((role) => set.has(role));
}

export function hasRole(userOrRoles, role) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles;
  return normalizeRoles(roles).includes(role);
}

export function isSuperAdmin(userOrRoles) {
  return hasRole(userOrRoles, 'super_admin');
}

export function isAdmin(userOrRoles) {
  return hasRole(userOrRoles, 'admin');
}

export function isManager(userOrRoles) {
  return hasRole(userOrRoles, 'manager');
}

export function canManageUsers(userOrRoles) {
  return isAdmin(userOrRoles);
}

export function canManageBilling(userOrRoles) {
  return isSuperAdmin(userOrRoles);
}

export function assertRoles(roles) {
  return normalizeRoles(roles).length > 0 ? normalizeRoles(roles) : ['annotator'];
}
