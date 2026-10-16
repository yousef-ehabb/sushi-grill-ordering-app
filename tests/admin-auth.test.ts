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

const { mockAuthState } = vi.hoisted(() => {
  return {
    mockAuthState: { currentUser: null as any },
  };
});

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuthState,
  db: {},
  isFirebaseConfigured: () => true,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('Admin Authentication & Privilege Escalation Hardening', () => {
  beforeEach(() => {
    (global as any).localStorage = new MockStorage();
    mockAuthState.currentUser = null;
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
    // Attacker injects fake admin session into localStorage
    localStorage.setItem(
      'pochinki_admin_session',
      JSON.stringify({ role: 'super_admin', scope: 'all', email: 'admin@pochinki.com' })
    );

    mockAuthState.currentUser = null;

    const { useAuthStore } = await import('../src/app/store/useAuthStore');

    // Execute checkSession
    await useAuthStore.getState().checkSession();

    // Must NOT be admin!
    const state = useAuthStore.getState();
    expect(state.isAdmin).toBe(false);
    expect(state.user).toBeNull();

    // Forged localStorage key must be purged
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
});
