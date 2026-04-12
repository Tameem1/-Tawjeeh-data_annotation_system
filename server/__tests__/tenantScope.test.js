import { describe, expect, it } from 'vitest';
import { assertTenantAccess, getTenantOrganizationId, isTenantUser } from '../services/tenantScope.js';

describe('tenantScope', () => {
  it('allows super admins with an organization to act in their workspace', () => {
    const user = {
      id: 'super-admin-1',
      roles: ['super_admin', 'admin', 'manager', 'annotator'],
      organization_id: 'org-1',
    };

    expect(isTenantUser(user)).toBe(true);
    expect(getTenantOrganizationId(user)).toBe('org-1');
    expect(assertTenantAccess(user)).toEqual({ ok: true, organizationId: 'org-1' });
  });

  it('still rejects users without an organization workspace', () => {
    const user = {
      id: 'super-admin-1',
      roles: ['super_admin', 'admin', 'manager', 'annotator'],
      organization_id: null,
    };

    expect(isTenantUser(user)).toBe(false);
    expect(assertTenantAccess(user)).toEqual({ ok: false, status: 403, error: 'Access denied' });
  });
});
