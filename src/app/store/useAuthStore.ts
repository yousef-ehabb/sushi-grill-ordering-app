import { create } from 'zustand';
import { insforge } from '../../lib/insforge';
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

interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
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

function mapUser(authUser: any): UserProfile {
    return {
        id: authUser.id,
        email: authUser.email,
        name: authUser.profile?.name || '',
        phone: authUser.profile?.phone || '',
        address: authUser.profile?.address || '',
        avatar_url: authUser.profile?.avatar_url || null,
    };
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    error: null,
    pendingProfile: null,

    clearError: () => set({ error: null }),

    // ── Admin Auth ──────────────────────────────────────────

    login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            // Look up admin username to get their email
            const { data: adminRows, error: lookupError } = await insforge.database
                .from('admin_users')
                .select()
                .eq('username', username.trim());

            if (lookupError || !adminRows || adminRows.length === 0) {
                set({ isLoading: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
                return false;
            }

            const adminEmail = adminRows[0].email;

            // Sign in with the admin's email + provided password
            const { data, error: signInError } = await insforge.auth.signInWithPassword({
                email: adminEmail,
                password,
            });

            if (signInError || !data?.user) {
                set({ isLoading: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
                return false;
            }

            set({
                user: mapUser(data.user),
                isAuthenticated: true,
                isAdmin: true,
                isLoading: false,
            });
            return true;
        } catch {
            set({ isLoading: false, error: 'حدث خطأ أثناء تسجيل الدخول' });
            return false;
        }
    },

    checkSession: async () => {
        set({ isLoading: true });
        try {
            const { data } = await insforge.auth.getCurrentSession();
            const authUser = data?.session?.user;

            if (!authUser) {
                set({ isAdmin: false, isLoading: false });
                return;
            }

            // Check if user exists in admin_users table
            const { data: adminRows } = await insforge.database
                .from('admin_users')
                .select()
                .eq('user_id', authUser.id);

            set({
                user: mapUser(authUser),
                isAuthenticated: true,
                isAdmin: !!(adminRows && adminRows.length > 0),
                isLoading: false,
            });
        } catch {
            // Network error — don't destroy a valid session
            set({ isLoading: false });
        }
    },

    initSession: async () => {
        try {
            set({ isLoading: true });
            const { data } = await insforge.auth.getCurrentSession();
            const authUser = data?.session?.user;

            if (authUser) {
                // Check if this session belongs to an admin
                const { data: adminRows } = await insforge.database
                    .from('admin_users')
                    .select()
                    .eq('user_id', authUser.id);

                const isAdminUser = !!(adminRows && adminRows.length > 0);

                if (isAdminUser) {
                    // Admin session — restore fully so session persists
                    set({
                        user: mapUser(authUser),
                        isAuthenticated: true,
                        isAdmin: true,
                        isLoading: false,
                    });
                } else {
                    // Customer session — expose normally
                    set({
                        user: mapUser(authUser),
                        isAuthenticated: true,
                        isAdmin: false,
                        isLoading: false,
                    });
                }
            } else {
                set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
            }
        } catch {
            // Network error — don't destroy a valid session
            set({ isLoading: false });
        }
    },

    signUp: async ({ name, email, phone, password, address }) => {
        set({ isLoading: true, error: null });

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
            const { data, error } = await insforge.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
                name: name.trim(),
            });

            if (error) {
                const msg = error.message || 'فشل إنشاء الحساب';
                set({ isLoading: false, error: msg });
                return { success: false, error: msg };
            }

            if (data?.requireEmailVerification) {
                set({
                    isLoading: false,
                    pendingProfile: { phone: normalizedPhone, address: address?.trim() || '' },
                });
                return {
                    success: true,
                    verificationRequired: true,
                    email: email.trim().toLowerCase(),
                };
            }

            if (data?.user && data?.accessToken) {
                try {
                    await insforge.auth.setProfile({
                        phone: normalizedPhone,
                        address: address?.trim() || '',
                    });
                } catch {
                    // Non-critical — profile can be updated later
                }

                set({
                    user: {
                        id: data.user.id,
                        email: data.user.email,
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
            }

            set({ isLoading: false });
            return { success: false, error: 'حدث خطأ غير متوقع' };
        } catch (err: any) {
            const msg = err.message || 'فشل إنشاء الحساب';
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
        }
    },

    verifyEmail: async (email, otp) => {
        set({ isLoading: true, error: null });
        try {
            const { data, error } = await insforge.auth.verifyEmail({ email, otp });

            if (error) {
                const msg = error.message || 'رمز التحقق غير صحيح';
                set({ isLoading: false, error: msg });
                return { success: false, error: msg };
            }

            if (data?.accessToken) {
                const { pendingProfile } = get();

                if (pendingProfile) {
                    try {
                        await insforge.auth.setProfile({
                            phone: pendingProfile.phone,
                            address: pendingProfile.address,
                        });
                    } catch {
                        // Non-critical — profile can be updated from account page
                    }
                }

                const { data: sessionData } = await insforge.auth.getCurrentSession();
                const fullUser = sessionData?.session?.user;

                set({
                    user: fullUser ? mapUser(fullUser) : {
                        id: data.user?.id || '',
                        email: data.user?.email || email,
                        name: data.user?.profile?.name || '',
                        phone: pendingProfile?.phone || '',
                        address: pendingProfile?.address || '',
                        avatar_url: null,
                    },
                    isAuthenticated: true,
                    isLoading: false,
                    pendingProfile: null,
                });
                return { success: true };
            }

            set({ isLoading: false });
            return { success: false, error: 'حدث خطأ غير متوقع' };
        } catch (err: any) {
            const msg = err.message || 'فشل التحقق';
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
        }
    },

    resendVerification: async (email) => {
        try {
            const { data, error } = await insforge.auth.resendVerificationEmail({ email });
            if (error) {
                return { success: false, error: error.message || 'فشل إعادة الإرسال' };
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || 'فشل إعادة الإرسال' };
        }
    },

    signIn: async (email, password) => {
        set({ isLoading: true, error: null });

        try {
            const { data, error } = await insforge.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });

            if (error) {
                const msg = error.message === 'Invalid login credentials'
                    ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                    : error.message || 'فشل تسجيل الدخول';
                set({ isLoading: false, error: msg });
                return { success: false, error: msg };
            }

            if (data?.user) {
                set({
                    user: mapUser(data.user),
                    isAuthenticated: true,
                    isLoading: false,
                });
                return { success: true };
            }

            set({ isLoading: false });
            return { success: false, error: 'حدث خطأ غير متوقع' };
        } catch (err: any) {
            const msg = err.message || 'فشل تسجيل الدخول';
            set({ isLoading: false, error: msg });
            return { success: false, error: msg };
        }
    },

    signOut: async () => {
        try {
            await insforge.auth.signOut();
        } finally {
            set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false, error: null, pendingProfile: null });
        }
    },

    // Alias for signOut — used by AdminView
    logout: async () => {
        try {
            await insforge.auth.signOut();
        } finally {
            set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false, error: null, pendingProfile: null });
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
            const { error } = await insforge.auth.setProfile(profileUpdate);
            if (error) {
                const msg = error.message || 'فشل تحديث الملف الشخصي';
                set({ error: msg });
                return { success: false, error: msg };
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
