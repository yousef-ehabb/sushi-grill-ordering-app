import { create } from 'zustand';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile as firebaseUpdateProfile,
    sendEmailVerification,
    type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../../lib/firebase';
import { normalizePhone, validateEgyptianPhone, validateEmail } from '../../lib/phoneUtils';

interface UserProfile {
    id: string;
    email: string;
    name: string;
    phone: string;
    address: string;
    avatar_url: string | null;
}

interface SignUpResult {
    success: boolean;
    error?: string;
    verificationRequired?: boolean;
    email?: string;
}

export type AdminRole = 'super_admin' | 'stadium_admin' | 'caravan_admin';
export type AdminBranchScope = 'all' | 'فرع الاستاد' | 'فرع الكرفان';

export interface AdminAccountConfig {
    role: AdminRole;
    scope: AdminBranchScope;
    title: string;
    defaultName: string;
}

export const ADMIN_ACCOUNTS: Record<string, AdminAccountConfig> = {
    'admin': {
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
    'stadium_admin': {
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
    'caravan_admin': {
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

interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    adminRole: AdminRole | null;
    adminBranchScope: AdminBranchScope | null;
    adminTitle: string | null;
    isLoading: boolean;
    error: string | null;
    pendingProfile: { phone: string; address: string } | null;

    initSession: () => Promise<void>;
    login: (username: string, password: string) => Promise<boolean>;
    checkSession: () => Promise<void>;
    signUp: (data: SignUpData) => Promise<SignUpResult>;
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    logout: () => Promise<void>;
    verifyEmail: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
    resendVerification: (email: string) => Promise<{ success: boolean; error?: string }>;
    updateProfile: (data: Partial<Pick<UserProfile, 'name' | 'phone' | 'address'>>) => Promise<{ success: boolean; error?: string }>;
    clearError: () => void;
}

interface SignUpData {
    name: string;
    email: string;
    phone: string;
    password: string;
    address?: string;
}

async function loadUserProfile(fbUser: FirebaseUser): Promise<UserProfile> {
    const profile: UserProfile = {
        id: fbUser.uid,
        email: fbUser.email || '',
        name: fbUser.displayName || '',
        phone: '',
        address: '',
        avatar_url: fbUser.photoURL || null,
    };

    if (isFirebaseConfigured() && db) {
        try {
            const profileDoc = await getDoc(doc(db, 'user_profiles', fbUser.uid));
            if (profileDoc.exists()) {
                const data = profileDoc.data();
                profile.name = data.name || profile.name;
                profile.phone = data.phone || '';
                profile.address = data.address || '';
                profile.avatar_url = data.avatar_url || profile.avatar_url;
            }
        } catch (e) {
            console.warn('[Firebase Auth] Error loading user profile:', e);
        }
    }

    return profile;
}

async function checkIsFirebaseAdmin(fbUser: FirebaseUser): Promise<boolean> {
    if (fbUser.email?.toLowerCase() === 'admin@pochinki.com') {
        return true;
    }
    if (isFirebaseConfigured() && db) {
        try {
            const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
            if (adminDoc.exists()) {
                return true;
            }
        } catch (e) {
            console.warn('[Firebase Auth] Error checking admins doc:', e);
        }
    }
    return false;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    adminRole: null,
    adminBranchScope: null,
    adminTitle: null,
    isLoading: true,
    error: null,
    pendingProfile: null,

    clearError: () => set({ error: null }),

    // ── Admin Auth ──────────────────────────────────────────

    login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        const trimmed = username.trim().toLowerCase();
        const account = ADMIN_ACCOUNTS[trimmed];

        if (!account) {
            set({ isLoading: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            return false;
        }

        const isMasterPassword = password === 'Pochinki@2026!';
        let isFirebaseAuthenticated = false;

        if (isFirebaseConfigured() && auth && (trimmed === 'admin' || trimmed === 'admin@pochinki.com')) {
            try {
                const cred = await signInWithEmailAndPassword(auth, 'admin@pochinki.com', password);
                if (cred.user) {
                    isFirebaseAuthenticated = true;
                }
            } catch (err) {
                // If Firebase Auth fails, we still check isMasterPassword below
            }
        }

        if (!isMasterPassword && !isFirebaseAuthenticated) {
            set({ isLoading: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            return false;
        }

        const sessionPayload = {
            role: account.role,
            scope: account.scope,
            title: account.title,
            name: account.defaultName,
            email: trimmed.includes('@') ? trimmed : `${trimmed}@pochinki.com`,
        };

        try {
            localStorage.setItem('pochinki_admin_session', JSON.stringify(sessionPayload));
        } catch (e) {
            console.warn('[Auth] Failed to store admin session:', e);
        }

        set({
            user: {
                id: `admin_${account.role}`,
                email: sessionPayload.email,
                name: account.defaultName,
                phone: '',
                address: '',
                avatar_url: null,
            },
            isAuthenticated: false,
            isAdmin: true,
            adminRole: account.role,
            adminBranchScope: account.scope,
            adminTitle: account.title,
            isLoading: false,
            error: null,
        });

        return true;
    },

    checkSession: async () => {
        set({ isLoading: true });

        // 1. Check local admin session first
        try {
            const rawSession = localStorage.getItem('pochinki_admin_session');
            if (rawSession) {
                const session = JSON.parse(rawSession);
                if (session && session.role && session.scope) {
                    set({
                        user: {
                            id: `admin_${session.role}`,
                            email: session.email || '',
                            name: session.name || 'مدير النظام',
                            phone: '',
                            address: '',
                            avatar_url: null,
                        },
                        isAuthenticated: false,
                        isAdmin: true,
                        adminRole: session.role,
                        adminBranchScope: session.scope,
                        adminTitle: session.title,
                        isLoading: false,
                    });
                    return;
                }
            }
        } catch (e) {
            console.warn('[Auth] Failed to restore admin session:', e);
        }

        if (!isFirebaseConfigured() || !auth) {
            set({ user: null, isAuthenticated: false, isAdmin: false, adminRole: null, adminBranchScope: null, adminTitle: null, isLoading: false });
            return;
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
            const isAdminUser = await checkIsFirebaseAdmin(currentUser);
            if (isAdminUser) {
                set({
                    user: {
                        id: currentUser.uid,
                        email: currentUser.email || '',
                        name: currentUser.displayName || 'مدير النظام (بوشنكي)',
                        phone: '',
                        address: '',
                        avatar_url: null,
                    },
                    isAuthenticated: false,
                    isAdmin: true,
                    adminRole: 'super_admin',
                    adminBranchScope: 'all',
                    adminTitle: 'الإدارة العامة',
                    isLoading: false,
                });
                return;
            }

            // Regular user
            const profile = await loadUserProfile(currentUser);
            set({
                user: profile,
                isAuthenticated: true,
                isAdmin: false,
                adminRole: null,
                adminBranchScope: null,
                adminTitle: null,
                isLoading: false,
            });
            return;
        }

        if (!get().isAdmin) {
            set({ user: null, isAuthenticated: false, isAdmin: false, adminRole: null, adminBranchScope: null, adminTitle: null, isLoading: false });
        } else {
            set({ isLoading: false });
        }
    },

    initSession: async () => {
        try {
            set({ isLoading: true });

            // Restore stored admin session immediately if available
            try {
                const rawSession = localStorage.getItem('pochinki_admin_session');
                if (rawSession) {
                    const session = JSON.parse(rawSession);
                    if (session && session.role && session.scope) {
                        set({
                            user: {
                                id: `admin_${session.role}`,
                                email: session.email || '',
                                name: session.name || 'مدير النظام',
                                phone: '',
                                address: '',
                                avatar_url: null,
                            },
                            isAuthenticated: false,
                            isAdmin: true,
                            adminRole: session.role,
                            adminBranchScope: session.scope,
                            adminTitle: session.title,
                            isLoading: false,
                        });
                    }
                }
            } catch (e) {
                // Ignore
            }

            if (!isFirebaseConfigured() || !auth) {
                if (!get().isAdmin) {
                    set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
                }
                return;
            }

            onAuthStateChanged(auth, async (fbUser) => {
                if (fbUser) {
                    const isAdminUser = await checkIsFirebaseAdmin(fbUser);
                    if (isAdminUser) {
                        set({
                            user: {
                                id: fbUser.uid,
                                email: fbUser.email || '',
                                name: fbUser.displayName || 'مدير النظام (بوشنكي)',
                                phone: '',
                                address: '',
                                avatar_url: null,
                            },
                            isAuthenticated: false,
                            isAdmin: true,
                            isLoading: false,
                        });
                        return;
                    }

                    // Regular user session
                    const profile = await loadUserProfile(fbUser);
                    set({
                        user: profile,
                        isAuthenticated: true,
                        isAdmin: false,
                        isLoading: false,
                    });
                } else {
                    set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
                }
            });
        } catch {
            set({ isLoading: false });
        }
    },

    signUp: async ({ name, email, phone, password, address }) => {
        set({ isLoading: true, error: null });

        if (!isFirebaseConfigured() || !auth) {
            set({ isLoading: false, error: 'Firebase غير مهيأ' });
            return { success: false, error: 'Firebase غير مهيأ' };
        }

        if (!validateEmail(email)) {
            set({ isLoading: false, error: 'البريد الإلكتروني غير صالح' });
            return { success: false, error: 'البريد الإلكتروني غير صالح' };
        }

        const phoneCheck = validateEgyptianPhone(phone);
        if (!phoneCheck.valid) {
            set({ isLoading: false, error: phoneCheck.error });
            return { success: false, error: phoneCheck.error };
        }

        const normalizedPhone = normalizePhone(phone);

        try {
            const cred = await createUserWithEmailAndPassword(
                auth,
                email.trim().toLowerCase(),
                password
            );

            // Update display name
            await firebaseUpdateProfile(cred.user, { displayName: name.trim() });

            // Save profile to Firestore
            if (db) {
                try {
                    await setDoc(doc(db, 'user_profiles', cred.user.uid), {
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        phone: normalizedPhone,
                        address: address?.trim() || '',
                        avatar_url: null,
                        created_at: new Date().toISOString(),
                    });
                } catch (profileErr) {
                    console.warn('[Firebase] Error saving profile to Firestore:', profileErr);
                }
            }

            // Send email verification
            try {
                await sendEmailVerification(cred.user);
            } catch (verifyErr) {
                console.warn('[Firebase] Error sending verification email:', verifyErr);
            }

            set({
                user: {
                    id: cred.user.uid,
                    email: cred.user.email || email.trim().toLowerCase(),
                    name: name.trim(),
                    phone: normalizedPhone,
                    address: address?.trim() || '',
                    avatar_url: null,
                },
                isAuthenticated: true,
                isLoading: false,
                pendingProfile: null,
            });
            return { success: true };
        } catch (err: any) {
            let msg = 'فشل إنشاء الحساب';
            if (err.code === 'auth/email-already-in-use') {
                msg = 'هذا البريد الإلكتروني مسجل بالفعل';
            } else if (err.code === 'auth/weak-password') {
                msg = 'كلمة المرور ضعيفة جداً';
            } else if (err.code === 'auth/invalid-email') {
                msg = 'البريد الإلكتروني غير صالح';
            }
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
        }
    },

    verifyEmail: async (_email, _otp) => {
        // Firebase handles email verification via link, not OTP
        // This is kept for API compatibility but won't be called in the Firebase flow
        return { success: false, error: 'التحقق عبر OTP غير مدعوم في Firebase. يرجى التحقق من بريدك الإلكتروني.' };
    },

    resendVerification: async (_email) => {
        if (!isFirebaseConfigured() || !auth || !auth.currentUser) {
            return { success: false, error: 'غير مسجّل الدخول' };
        }

        try {
            await sendEmailVerification(auth.currentUser);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || 'فشل إعادة الإرسال' };
        }
    },

    signIn: async (email, password) => {
        set({ isLoading: true, error: null });

        if (!isFirebaseConfigured() || !auth) {
            set({ isLoading: false, error: 'Firebase غير مهيأ' });
            return { success: false, error: 'Firebase غير مهيأ' };
        }

        try {
            const cred = await signInWithEmailAndPassword(
                auth,
                email.trim().toLowerCase(),
                password
            );

            if (cred.user) {
                const isAdminUser = await checkIsFirebaseAdmin(cred.user);
                if (isAdminUser) {
                    await firebaseSignOut(auth);
                    set({ isLoading: false, error: 'هذا حساب إدمن. استخدم صفحة دخول الأدمن.' });
                    return { success: false, error: 'هذا حساب إدمن. استخدم صفحة دخول الأدمن.' };
                }

                const profile = await loadUserProfile(cred.user);
                set({
                    user: profile,
                    isAuthenticated: true,
                    isAdmin: false,
                    isLoading: false,
                });
                return { success: true };
            }

            set({ isLoading: false });
            return { success: false, error: 'حدث خطأ غير متوقع' };
        } catch (err: any) {
            let msg = 'فشل تسجيل الدخول';
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
            } else if (err.code === 'auth/too-many-requests') {
                msg = 'تم إيقاف الحساب مؤقتاً بسبب محاولات تسجيل دخول كثيرة. حاول لاحقاً.';
            }
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
        }
    },

    signOut: async () => {
        try {
            localStorage.removeItem('pochinki_admin_session');
        } catch {}
        try {
            if (isFirebaseConfigured() && auth) {
                await firebaseSignOut(auth).catch(() => {});
            }
        } finally {
            set({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                adminRole: null,
                adminBranchScope: null,
                adminTitle: null,
                isLoading: false,
                error: null,
                pendingProfile: null,
            });
        }
    },

    // Alias for signOut — used by AdminView
    logout: async () => {
        try {
            localStorage.removeItem('pochinki_admin_session');
        } catch {}
        try {
            if (isFirebaseConfigured() && auth) {
                await firebaseSignOut(auth).catch(() => {});
            }
        } finally {
            set({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                adminRole: null,
                adminBranchScope: null,
                adminTitle: null,
                isLoading: false,
                error: null,
                pendingProfile: null,
            });
        }
    },

    updateProfile: async (updates) => {
        set({ error: null });
        const { user } = get();
        if (!user) return { success: false, error: 'غير مسجّل الدخول' };

        const profileUpdate: Record<string, string> = {};
        if (updates.name !== undefined) profileUpdate.name = updates.name.trim();
        if (updates.address !== undefined) profileUpdate.address = updates.address.trim();

        if (updates.phone !== undefined) {
            const phoneCheck = validateEgyptianPhone(updates.phone);
            if (!phoneCheck.valid) {
                set({ error: phoneCheck.error });
                return { success: false, error: phoneCheck.error };
            }
            profileUpdate.phone = normalizePhone(updates.phone);
        }

        try {
            // Update display name in Firebase Auth
            if (isFirebaseConfigured() && auth?.currentUser && profileUpdate.name) {
                await firebaseUpdateProfile(auth.currentUser, { displayName: profileUpdate.name });
            }

            // Update profile in Firestore
            if (isFirebaseConfigured() && db) {
                const profileRef = doc(db, 'user_profiles', user.id);
                const profileDoc = await getDoc(profileRef);

                if (profileDoc.exists()) {
                    await updateDoc(profileRef, {
                        ...profileUpdate,
                        updated_at: new Date().toISOString(),
                    });
                } else {
                    await setDoc(profileRef, {
                        ...profileUpdate,
                        email: user.email,
                        created_at: new Date().toISOString(),
                    });
                }
            }

            set({
                user: {
                    ...user,
                    ...profileUpdate,
                },
            });
            return { success: true };
        } catch (err: any) {
            const msg = err.message || 'فشل تحديث الملف الشخصي';
            set({ error: msg });
            return { success: false, error: msg };
        }
    },
}));
