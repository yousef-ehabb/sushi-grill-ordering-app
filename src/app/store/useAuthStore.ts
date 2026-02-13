import { create } from 'zustand';
import { insforge } from '../../lib/insforge';

interface AuthState {
    isAdmin: boolean;
    isLoading: boolean;
    error: string | null;
    accessToken: string | null;
    csrfToken: string | null;

    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    checkSession: () => Promise<void>;
}

const USERNAME_TO_EMAIL = (username: string) => `${username}@sushigrill.app`;

export const useAuthStore = create<AuthState>()((set, get) => ({
    isAdmin: false,
    isLoading: true,
    error: null,
    accessToken: null,
    csrfToken: null,

    login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
            const email = USERNAME_TO_EMAIL(username);
            const { data, error } = await insforge.auth.signInWithPassword({
                email,
                password,
            });

            if (error || !data) {
                const msg =
                    error?.message === 'Invalid email or password'
                        ? 'اسم المستخدم أو كلمة المرور غير صحيحة'
                        : error?.message || 'فشل تسجيل الدخول';
                set({ isLoading: false, error: msg });
                return false;
            }

            const userId = data.user?.id;
            if (!userId) {
                set({ isLoading: false, error: 'لم يتم العثور على المستخدم' });
                return false;
            }

            // Verify admin role
            const { data: adminRows, error: adminError } = await insforge.database
                .from('admin_users')
                .select()
                .eq('user_id', userId);

            if (adminError || !adminRows || adminRows.length === 0) {
                await insforge.auth.signOut();
                set({ isLoading: false, error: 'هذا الحساب ليس لديه صلاحية إدارة' });
                return false;
            }

            set({
                isAdmin: true,
                isLoading: false,
                accessToken: data.accessToken || null,
                csrfToken: (data as any).csrfToken || null,
            });
            return true;
        } catch (err: any) {
            set({ isLoading: false, error: err.message || 'خطأ غير متوقع' });
            return false;
        }
    },

    logout: async () => {
        try {
            await insforge.auth.signOut();
        } catch {
            // Ignore logout errors
        }
        set({ isAdmin: false, accessToken: null, csrfToken: null });
    },

    checkSession: async () => {
        set({ isLoading: true });
        try {
            const { data, error } = await insforge.auth.getCurrentSession();

            if (error || !data?.session) {
                set({ isAdmin: false, isLoading: false });
                return;
            }

            const userId = (data.session as any).user?.id || (data.session as any).userId;
            if (!userId) {
                set({ isAdmin: false, isLoading: false });
                return;
            }

            // Verify admin role
            const { data: adminRows } = await insforge.database
                .from('admin_users')
                .select()
                .eq('user_id', userId);

            set({
                isAdmin: !!(adminRows && adminRows.length > 0),
                isLoading: false,
                accessToken: (data.session as any).accessToken || null,
            });
        } catch {
            set({ isAdmin: false, isLoading: false });
        }
    },
}));
