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

async function checkIsFirebaseAdmin(fbUser: FirebaseUser): Promise<{ isAdmin: boolean; role: AdminRole; scope: AdminBranchScope; title: string } | null> {
    if (!fbUser) return null;

    // 1. Authoritative check: Firestore `/admins/{uid}` document (allows instant deactivation)
    if (isFirebaseConfigured() && db) {
        try {
            const adminDoc = await getDoc(doc(db, 'admins', fbUser.uid));
            if (adminDoc.exists()) {
                const data = adminDoc.data();
                // Strictly deny deactivated accounts
                if (data.is_active === false) {
                    console.warn('[Firebase Auth] Admin account is marked inactive');
                    return null;
                }
                const role = (data.role || 'super_admin') as AdminRole;
                const scope = (data.scope || (role === 'stadium_admin' ? 'فرع الاستاد' : role === 'caravan_admin' ? 'فرع الكرفان' : 'all')) as AdminBranchScope;
                const title = data.title || (role === 'stadium_admin' ? 'فرع الاستاد' : role === 'caravan_admin' ? 'فرع الكرفان' : 'الإدارة العامة');
                return { isAdmin: true, role, scope, title };
            }
        } catch (e) {
            console.warn('[Firebase Auth] Error checking admins collection doc:', e);
        }
    }

    // 2. Custom claims (tamper-proof server-issued token claims)
    try {
        const idTokenResult = await fbUser.getIdTokenResult(true);
        const role = idTokenResult.claims.role as string | undefined;
        if (role === 'admin' || role === 'super_admin') {
            return { isAdmin: true, role: 'super_admin', scope: 'all', title: 'الإدارة العامة' };
        }
        if (role === 'stadium_admin') {
            return { isAdmin: true, role: 'stadium_admin', scope: 'فرع الاستاد', title: 'فرع الاستاد' };
        }
        if (role === 'caravan_admin') {
            return { isAdmin: true, role: 'caravan_admin', scope: 'فرع الكرفان', title: 'فرع الكرفان' };
        }
    } catch (e) {
        console.warn('[Firebase Auth] Error inspecting ID token claims:', e);
    }

    // 3. Fallback for primary administrator email only
    if (fbUser.email?.toLowerCase() === 'admin@pochinki.com') {
        return { isAdmin: true, role: 'super_admin', scope: 'all', title: 'الإدارة العامة' };
    }

    return null;
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

        if (!username || !username.trim() || !password || !password.trim()) {
            set({ isLoading: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
            return false;
        }

        const trimmed = username.trim().toLowerCase();
        const account = ADMIN_ACCOUNTS[trimmed];

        // Format email from alias if recognized, otherwise use raw input if email
        const adminEmail = trimmed.includes('@')
            ? trimmed
            : (account ? `${trimmed}@pochinki.com` : `${trimmed}@pochinki.com`);

        if (!isFirebaseConfigured() || !auth) {
            set({ isLoading: false, error: 'خدمة Firebase غير مهيأة' });
            return false;
        }

        try {
            // Strictly authenticate against Firebase Auth using provided credentials
            const cred = await signInWithEmailAndPassword(auth, adminEmail, password);
            if (!cred.user) {
                set({ isLoading: false, error: 'فشل التحقق من بيانات الدخول' });
                return false;
            }

            // Verify server authorization (claims, /admins collection, or verified admin account)
            const adminInfo = await checkIsFirebaseAdmin(cred.user);
            if (!adminInfo || !adminInfo.isAdmin) {
                await firebaseSignOut(auth);
                localStorage.removeItem('pochinki_admin_session');
                set({
                    user: null,
                    isAuthenticated: false,
                    isAdmin: false,
                    isLoading: false,
                    error: 'هذا الحساب ليس لديه صلاحيات وصول كمسؤول',
                });
                return false;
            }

            const sessionPayload = {
                role: adminInfo.role,
                scope: adminInfo.scope,
                title: adminInfo.title,
                name: cred.user.displayName || (account ? account.defaultName : 'مدير النظام (بوشنكي)'),
                email: cred.user.email || adminEmail,
            };

            try {
                localStorage.setItem('pochinki_admin_session', JSON.stringify(sessionPayload));
            } catch (e) {
                console.warn('[Auth] Failed to store admin session metadata:', e);
            }

            set({
                user: {
                    id: cred.user.uid,
                    email: sessionPayload.email,
                    name: sessionPayload.name,
                    phone: '',
                    address: '',
                    avatar_url: null,
                },
                isAuthenticated: false,
                isAdmin: true,
                adminRole: adminInfo.role,
                adminBranchScope: adminInfo.scope,
                adminTitle: adminInfo.title,
                isLoading: false,
                error: null,
            });

            return true;
        } catch (err: any) {
            localStorage.removeItem('pochinki_admin_session');
            let msg = 'اسم المستخدم أو كلمة المرور غير صحيحة';
            if (err.code === 'auth/too-many-requests') {
                msg = 'تم تعليق الحساب مؤقتاً بسبب كثرة محاولات الدخول الخاطئة. يرجى المحاولة لاحقاً.';
            }
            set({ isLoading: false, error: msg });
            return false;
        }
    },

    checkSession: async () => {
        set({ isLoading: true });

        // 1. Without configured Firebase Auth, no session can be authenticated
        if (!isFirebaseConfigured() || !auth) {
            localStorage.removeItem('pochinki_admin_session');
            set({ user: null, isAuthenticated: false, isAdmin: false, adminRole: null, adminBranchScope: null, adminTitle: null, isLoading: false });
            return;
        }

        // 2. Check active Firebase Auth user
        const currentUser = auth.currentUser;
        if (!currentUser) {
            // Unauthenticated: strictly purge any client localStorage session
            localStorage.removeItem('pochinki_admin_session');
            set({ user: null, isAuthenticated: false, isAdmin: false, adminRole: null, adminBranchScope: null, adminTitle: null, isLoading: false });
            return;
        }

        // Verify server-side admin privilege
        const adminInfo = await checkIsFirebaseAdmin(currentUser);
        if (adminInfo && adminInfo.isAdmin) {
            const rawSession = localStorage.getItem('pochinki_admin_session');
            let session = rawSession ? JSON.parse(rawSession) : null;

            set({
                user: {
                    id: currentUser.uid,
                    email: currentUser.email || '',
                    name: currentUser.displayName || session?.name || 'مدير النظام (بوشنكي)',
                    phone: '',
                    address: '',
                    avatar_url: null,
                },
                isAuthenticated: false,
                isAdmin: true,
                adminRole: adminInfo.role || session?.role || 'super_admin',
                adminBranchScope: adminInfo.scope || session?.scope || 'all',
                adminTitle: adminInfo.title || session?.title || 'الإدارة العامة',
                isLoading: false,
            });
            return;
        }

        // Regular customer session
        localStorage.removeItem('pochinki_admin_session');
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
    },

    initSession: async () => {
        try {
            set({ isLoading: true });

            if (!isFirebaseConfigured() || !auth) {
                localStorage.removeItem('pochinki_admin_session');
                set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
                return;
            }

            // Strictly listen to authoritative Firebase Auth state changes
            onAuthStateChanged(auth, async (fbUser) => {
                if (fbUser) {
                    const adminInfo = await checkIsFirebaseAdmin(fbUser);
                    if (adminInfo && adminInfo.isAdmin) {
                        const rawSession = localStorage.getItem('pochinki_admin_session');
                        let session = rawSession ? JSON.parse(rawSession) : null;

                        set({
                            user: {
                                id: fbUser.uid,
                                email: fbUser.email || '',
                                name: fbUser.displayName || session?.name || 'مدير النظام (بوشنكي)',
                                phone: '',
                                address: '',
                                avatar_url: null,
                            },
                            isAuthenticated: false,
                            isAdmin: true,
                            adminRole: adminInfo.role || session?.role || 'super_admin',
                            adminBranchScope: adminInfo.scope || session?.scope || 'all',
                            adminTitle: adminInfo.title || session?.title || 'الإدارة العامة',
                            isLoading: false,
                        });
                        return;
                    }

                    // Regular customer user session
                    localStorage.removeItem('pochinki_admin_session');
                    const profile = await loadUserProfile(fbUser);
                    set({
                        user: profile,
                        isAuthenticated: true,
                        isAdmin: false,
                        adminRole: null,
                        adminBranchScope: null,
                        adminTitle: null,
                        isLoading: false,
                    });
                } else {
                    // No active Firebase Auth session: clear all privileges immediately
                    localStorage.removeItem('pochinki_admin_session');
                    set({
                        user: null,
                        isAuthenticated: false,
                        isAdmin: false,
                        adminRole: null,
                        adminBranchScope: null,
                        adminTitle: null,
                        isLoading: false
                    });
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
