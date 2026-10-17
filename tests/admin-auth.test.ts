import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock localStorage for test environment
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const { mockAuthState, mockFirestoreData } = vi.hoisted(() => {
  return {
    mockAuthState: { currentUser: null as any },
    mockFirestoreData: { adminDoc: null as any },
  };
});

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuthState,
  db: {},
  isFirebaseConfigured: () => true,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: async (_docRef: any) => ({
    exists: () => !!mockFirestoreData.adminDoc,
    data: () => mockFirestoreData.adminDoc || {},
  }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('Admin Authentication & Privilege Escalation Hardening', () => {
  beforeEach(() => {
    (global as any).localStorage = new MockStorage();
    mockAuthState.currentUser = null;
    mockFirestoreData.adminDoc = null;
  });

  it('verifies that no hardcoded passwords exist in useAuthStore.ts', () => {
    const authStorePath = path.resolve(__dirname, '../src/app/store/useAuthStore.ts');
    const content = fs.readFileSync(authStorePath, 'utf8');

    // Ensure the previously leaked password pattern is completely gone
    expect(content.includes('Pochinki@2026!')).toBe(false);
    expect(content.includes('admin123')).toBe(false);

    // Ensure no automatic sign in with hardcoded email and password in initSession
    expect(content.includes("signInWithEmailAndPassword(auth, 'admin@pochinki.com', '")).toBe(false);
  });

  it('rejects admin elevation from localStorage manipulation alone', async () => {
    localStorage.setItem(
      'pochinki_admin_session',
      JSON.stringify({ role: 'super_admin', scope: 'all', email: 'admin@pochinki.com' })
    );

    mockAuthState.currentUser = null;

    const { useAuthStore } = await import('../src/app/store/useAuthStore');
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(false);
    expect(state.user).toBeNull();
    expect(localStorage.getItem('pochinki_admin_session')).toBeNull();
  });

  it('treats regular authenticated customer as non-admin even if localStorage was tampered', async () => {
    localStorage.setItem(
      'pochinki_admin_session',
      JSON.stringify({ role: 'super_admin', scope: 'all' })
    );

    mockAuthState.currentUser = {
      uid: 'customer_123',
      email: 'customer@example.com',
      displayName: 'عميل عادي',
      getIdTokenResult: async () => ({ claims: {} }),
    };

    const { useAuthStore } = await import('../src/app/store/useAuthStore');
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('customer_123');
    expect(localStorage.getItem('pochinki_admin_session')).toBeNull();
  });

  it('strictly rejects access if admin record in Firestore has is_active: false', async () => {
    mockAuthState.currentUser = {
      uid: 'deactivated_admin',
      email: 'former_staff@pochinki.com',
      displayName: 'موظف معطل',
      getIdTokenResult: async () => ({ claims: { role: 'stadium_admin' } }),
    };

    // Admin document exists but is marked inactive
    mockFirestoreData.adminDoc = {
      uid: 'deactivated_admin',
      role: 'stadium_admin',
      scope: 'فرع الاستاد',
      is_active: false,
    };

    const { useAuthStore } = await import('../src/app/store/useAuthStore');
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(false);
  });

  it('correctly grants branch scope for active Stadium Branch admin', async () => {
    mockAuthState.currentUser = {
      uid: 'stadium_admin_uid',
      email: 'stadium_admin@pochinki.com',
      displayName: 'مدير فرع الاستاد',
      getIdTokenResult: async () => ({ claims: { role: 'stadium_admin' } }),
    };

    mockFirestoreData.adminDoc = {
      uid: 'stadium_admin_uid',
      role: 'stadium_admin',
      scope: 'فرع الاستاد',
      is_active: true,
    };

    const { useAuthStore } = await import('../src/app/store/useAuthStore');
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(true);
    expect(state.adminRole).toBe('stadium_admin');
    expect(state.adminBranchScope).toBe('فرع الاستاد');
    expect(state.adminTitle).toBe('فرع الاستاد');
  });

  it('correctly grants branch scope for active Caravan Branch admin', async () => {
    mockAuthState.currentUser = {
      uid: 'caravan_admin_uid',
      email: 'caravan_admin@pochinki.com',
      displayName: 'مدير فرع الكرفان',
      getIdTokenResult: async () => ({ claims: { role: 'caravan_admin' } }),
    };

    mockFirestoreData.adminDoc = {
      uid: 'caravan_admin_uid',
      role: 'caravan_admin',
      scope: 'فرع الكرفان',
      is_active: true,
    };

    const { useAuthStore } = await import('../src/app/store/useAuthStore');
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(true);
    expect(state.adminRole).toBe('caravan_admin');
    expect(state.adminBranchScope).toBe('فرع الكرفان');
    expect(state.adminTitle).toBe('فرع الكرفان');
  });
});
