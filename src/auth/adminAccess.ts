export type AdminRole = 'super_admin' | 'stadium_admin' | 'caravan_admin';
export type AdminBranchScope = 'all' | 'فرع الاستاد' | 'فرع الكرفان';

export interface AdminGrant {
  isAdmin: true;
  role: AdminRole;
  scope: AdminBranchScope;
  title: string;
}

/** Display-only aliases. Never used to grant privilege without a Firebase Auth session. */
export const ADMIN_ACCOUNT_DISPLAY: Record<string, { role: AdminRole; scope: AdminBranchScope; title: string; defaultName: string }> = {
  admin: {
    role: 'super_admin',
    scope: 'all',
    title: 'الإدارة العامة',
    defaultName: 'مدير النظام (الإدارة العامة)',
  },
  'admin@pochinki.com': {
    role: 'super_admin',
    scope: 'all',
    title: 'الإدارة العامة',
    defaultName: 'مدير النظام (الإدارة العامة)',
  },
  stadium_admin: {
    role: 'stadium_admin',
    scope: 'فرع الاستاد',
    title: 'فرع الاستاد',
    defaultName: 'مدير فرع الاستاد',
  },
  'stadium_admin@pochinki.com': {
    role: 'stadium_admin',
    scope: 'فرع الاستاد',
    title: 'فرع الاستاد',
    defaultName: 'مدير فرع الاستاد',
  },
  caravan_admin: {
    role: 'caravan_admin',
    scope: 'فرع الكرفان',
    title: 'فرع الكرفان',
    defaultName: 'مدير فرع الكرفان',
  },
  'caravan_admin@pochinki.com': {
    role: 'caravan_admin',
    scope: 'فرع الكرفان',
    title: 'فرع الكرفان',
    defaultName: 'مدير فرع الكرفان',
  },
};

const ADMIN_EMAIL_ALLOWLIST = new Set(
  Object.keys(ADMIN_ACCOUNT_DISPLAY).filter((key) => key.includes('@'))
);

export const ADMIN_SESSION_STORAGE_KEY = 'pochinki_admin_session';

export function resolveAdminFromTokenClaims(claims: Record<string, unknown> | null | undefined): AdminGrant | null {
  if (!claims) return null;

  const role = typeof claims.role === 'string' ? claims.role : '';
  if (role === 'admin' || role === 'super_admin') {
    return { isAdmin: true, role: 'super_admin', scope: 'all', title: 'الإدارة العامة' };
  }
  if (role === 'stadium_admin') {
    return { isAdmin: true, role: 'stadium_admin', scope: 'فرع الاستاد', title: 'فرع الاستاد' };
  }
  if (role === 'caravan_admin') {
    return { isAdmin: true, role: 'caravan_admin', scope: 'فرع الكرفان', title: 'فرع الكرفان' };
  }

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (email && ADMIN_EMAIL_ALLOWLIST.has(email)) {
    const display = ADMIN_ACCOUNT_DISPLAY[email];
    return { isAdmin: true, role: display.role, scope: display.scope, title: display.title };
  }

  return null;
}

export function resolveAdminFromAdminRecord(data: Record<string, unknown> | null | undefined): AdminGrant | null {
  if (!data) return null;
  const role = (typeof data.role === 'string' ? data.role : 'super_admin') as AdminRole;
  const scope = (typeof data.scope === 'string' ? data.scope : 'all') as AdminBranchScope;
  const title =
    typeof data.title === 'string'
      ? data.title
      : role === 'stadium_admin'
        ? 'فرع الاستاد'
        : role === 'caravan_admin'
          ? 'فرع الكرفان'
          : 'الإدارة العامة';
  return { isAdmin: true, role, scope, title };
}

/**
 * localStorage is never an authorization source.
 * A forged admin session blob cannot grant access without a Firebase Auth user.
 */
export function resolveAdminPrivilege(input: {
  hasFirebaseUser: boolean;
  tokenClaims?: Record<string, unknown> | null;
  adminRecord?: Record<string, unknown> | null;
  localStorageSession?: string | null;
}): AdminGrant | null {
  if (!input.hasFirebaseUser) {
    return null;
  }

  return resolveAdminFromTokenClaims(input.tokenClaims) || resolveAdminFromAdminRecord(input.adminRecord);
}
