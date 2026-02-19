import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { insforge } from '../../lib/insforge';

export type Category = {
  id: string;
  name_ar: string;
  name_en: string;
  sort_order?: number;
  is_active: boolean;
};

export type Product = {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  price: number;
  image_url: string;
  is_available: boolean;
  is_best_seller?: boolean;
  is_chef_pick?: boolean;
  ingredients_ar?: string[];
};

export type ProductOption = {
  id: string;
  group_id: string;
  key?: string;
  name_ar: string;
  price_delta: number;
  is_active: boolean;
  sort_order: number;
};

export type OptionGroup = {
  id: string;
  product_id: string;
  key: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  is_active: boolean;
  sort_order: number;
  options?: ProductOption[];
};

export type CartItem = Product & {
  quantity: number;
  specialInstructions?: string;
  selectedOptionIds?: string[];
  optionsPrice: number;
  cartKey: string;
};

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';

export type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  address?: string;
  user_id?: string;
  type: 'pickup' | 'delivery';
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  created_at: string;
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  name_ar: string;
  quantity: number;
  unit_price: number;
  special_instructions?: string;
  selected_option_ids?: string[];
};

export type GlobalSettings = {
  id: string;
  is_website_open: boolean;
  closed_message: string;
  updated_at?: string;
};

export type BusinessRule = {
  id: string;
  category_id: string;
  min_quantity: number;
};

interface AppState {
  categories: Category[];
  products: Product[];
  optionGroupsByProductId: Record<string, OptionGroup[]>;
  optionGroupLoadingByProductId: Record<string, boolean>;
  allOptionGroups: OptionGroup[];
  cart: CartItem[];
  orders: Order[];
  orderType: 'pickup' | 'delivery' | null;
  loading: boolean;
  error: string | null;

  // Operational Controls
  globalSettings: GlobalSettings | null;
  businessRules: BusinessRule[];

  // Active Order (header badge)
  activeOrder: { id: string; status: OrderStatus } | null;

  // Data Fetching
  fetchCategories: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  fetchProductOptionGroups: (productId: string) => Promise<void>;
  fetchAllOptionGroups: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchActiveOrder: () => Promise<void>;
  fetchGlobalSettings: () => Promise<void>;
  fetchBusinessRules: () => Promise<void>;

  // Cart Actions
  setOrderType: (type: 'pickup' | 'delivery') => void;
  addToCart: (product: Product) => void;
  addToCartWithDetails: (product: Product, quantity: number, specialInstructions?: string, selectedOptionIds?: string[]) => void;
  removeFromCart: (cartKey: string) => void;
  updateQuantity: (cartKey: string, delta: number) => void;
  clearCart: () => void;

  // Order Actions
  submitOrder: (order: Omit<Order, 'id' | 'created_at' | 'status' | 'items'> & { items: CartItem[] }) => Promise<string | null>;
  reorderFromHistory: (items: OrderItem[]) => { added: number; skipped: string[] };

  // Admin Actions
  toggleAvailability: (productId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  uploadProductImage: (productId: string, file: File) => Promise<string | null>;

  // Sauce Management
  toggleOptionActive: (optionId: string) => Promise<void>;
  createOption: (groupId: string, data: { name_ar: string; price_delta: number }) => Promise<ProductOption | null>;
  updateOption: (optionId: string, data: Partial<Pick<ProductOption, 'name_ar' | 'price_delta'>>) => Promise<void>;
  deleteOption: (optionId: string) => Promise<void>;

  // Operational Control Actions
  updateGlobalSettings: (data: Partial<Pick<GlobalSettings, 'is_website_open' | 'closed_message'>>) => Promise<void>;
  toggleCategoryActive: (categoryId: string) => Promise<void>;
  updateBusinessRule: (categoryId: string, minQuantity: number) => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      categories: [],
      products: [],
      optionGroupsByProductId: {},
      optionGroupLoadingByProductId: {},
      allOptionGroups: [],
      cart: [],
      orders: [],
      orderType: null,
      loading: false,
      error: null,
      globalSettings: null,
      businessRules: [],
      activeOrder: null,

      // ── Data Fetching ──────────────────────────────────────

      fetchCategories: async () => {
        const { data, error } = await insforge.database
          .from('categories')
          .select()
          .order('sort_order', { ascending: true });

        if (error) {
          console.error('Failed to fetch categories:', error);
          return;
        }
        set({ categories: data || [] });
      },

      fetchProducts: async () => {
        const { data, error } = await insforge.database
          .from('products')
          .select();

        if (error) {
          console.error('Failed to fetch products:', error);
          return;
        }
        set({ products: data || [] });
      },

      fetchProductOptionGroups: async (productId: string) => {
        const state = get();
        if (state.optionGroupsByProductId[productId] !== undefined || state.optionGroupLoadingByProductId[productId]) {
          return;
        }

        set((current) => ({
          optionGroupLoadingByProductId: {
            ...current.optionGroupLoadingByProductId,
            [productId]: true,
          },
        }));

        const { data: groups, error: groupError } = await insforge.database
          .from('product_option_groups')
          .select('*, options:product_options(*)')
          .eq('product_id', productId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (groupError) {
          console.error('Failed to fetch option groups:', groupError);
          set((current) => ({
            optionGroupLoadingByProductId: {
              ...current.optionGroupLoadingByProductId,
              [productId]: false,
            },
          }));
          return;
        }

        // Also order the options within groups by sort_order
        const orderedGroups = (groups || []).map((group: any) => ({
          ...group,
          options: (group.options || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
        }));

        set((state) => ({
          optionGroupsByProductId: {
            ...state.optionGroupsByProductId,
            [productId]: orderedGroups
          },
          optionGroupLoadingByProductId: {
            ...state.optionGroupLoadingByProductId,
            [productId]: false,
          }
        }));
      },

      fetchOrders: async () => {
        const { data, error } = await insforge.database
          .from('orders')
          .select()
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to fetch orders:', error);
          return;
        }

        const ordersWithItems: Order[] = await Promise.all(
          (data || []).map(async (order: any) => {
            const { data: items } = await insforge.database
              .from('order_items')
              .select()
              .eq('order_id', order.id);

            return {
              ...order,
              items: (items || []).map((item: any) => ({
                id: item.id,
                product_id: item.product_id,
                name_ar: item.name_ar,
                quantity: item.quantity,
                unit_price: item.unit_price,
                selected_option_ids: item.selected_option_ids,
                special_instructions: item.special_instructions,
              })),
            };
          })
        );

        set({ orders: ordersWithItems });
      },

      fetchActiveOrder: async () => {
        const { data, error } = await insforge.database
          .from('orders')
          .select('id, status')
          .not('status', 'in', '(completed,cancelled)')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !data || data.length === 0) {
          set({ activeOrder: null });
          return;
        }
        set({ activeOrder: { id: data[0].id, status: data[0].status } });
      },

      fetchGlobalSettings: async () => {
        const { data, error } = await insforge.database
          .from('global_settings')
          .select();

        if (error) {
          console.error('Failed to fetch global settings:', error);
          return;
        }
        if (data && data.length > 0) {
          set({ globalSettings: data[0] });
        }
      },

      fetchBusinessRules: async () => {
        const { data, error } = await insforge.database
          .from('business_rules')
          .select();

        if (error) {
          console.error('Failed to fetch business rules:', error);
          return;
        }
        set({ businessRules: data || [] });
      },

      // ── Cart Actions ───────────────────────────────────────

      setOrderType: (type) => set({ orderType: type }),

      addToCart: (product) =>
        set((state) => {
          // Guard: website closed
          if (state.globalSettings && !state.globalSettings.is_website_open) return state;
          // Guard: category inactive
          const category = state.categories.find(c => c.id === product.category_id);
          if (category && !category.is_active) return state;
          // Guard: product unavailable
          if (!product.is_available) return state;

          const cartKey = product.id;
          const existing = state.cart.find((item) => item.cartKey === cartKey);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.cartKey === cartKey
                  ? { ...item, quantity: item.quantity + 1, optionsPrice: item.optionsPrice ?? 0 }
                  : item
              ),
            };
          }
          return { cart: [...state.cart, { ...product, quantity: 1, optionsPrice: 0, cartKey }] };
        }),

      addToCartWithDetails: (product, quantity, specialInstructions, selectedOptionIds) =>
        set((state) => {
          // Guard: website closed
          if (state.globalSettings && !state.globalSettings.is_website_open) return state;
          // Guard: category inactive
          const category = state.categories.find(c => c.id === product.category_id);
          if (category && !category.is_active) return state;
          // Guard: product unavailable
          if (!product.is_available) return state;

          const trimmedNote = specialInstructions?.trim().slice(0, 200) || undefined;
          const sortedOptions = selectedOptionIds?.slice().sort() || [];
          const optionsKey = sortedOptions.length > 0 ? sortedOptions.join(',') : '';

          const groups = state.optionGroupsByProductId[product.id] || [];
          const allOptions = groups.flatMap(g => g.options || []);
          const optionsPrice = sortedOptions.reduce((sum, optId) => {
            const opt = allOptions.find(o => o.id === optId);
            return sum + (opt?.price_delta || 0);
          }, 0);

          const itemBasePrice = product.price;

          // If no note, merge with existing same-option entry
          if (!trimmedNote) {
            const cartKey = optionsKey ? `${product.id}:${optionsKey}` : product.id;
            const existing = state.cart.find((item) => item.cartKey === cartKey);
            if (existing) {
              return {
                cart: state.cart.map((item) =>
                  item.cartKey === cartKey ? { ...item, quantity: item.quantity + quantity } : item
                ),
              };
            }
            return { cart: [...state.cart, { ...product, quantity, selectedOptionIds: sortedOptions, optionsPrice, cartKey }] };
          }

          // With note → always a new cart entry
          const cartKey = optionsKey
            ? `${product.id}:${optionsKey}-${Date.now()}`
            : `${product.id}-${Date.now()}`;

          return {
            cart: [...state.cart, { ...product, quantity, specialInstructions: trimmedNote, selectedOptionIds: sortedOptions, optionsPrice, cartKey }],
          };
        }),

      removeFromCart: (cartKey) =>
        set((state) => ({
          cart: state.cart.filter((item) => item.cartKey !== cartKey),
        })),

      updateQuantity: (cartKey, delta) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.cartKey === cartKey
              ? { ...item, quantity: Math.max(1, item.quantity + delta) }
              : item
          ),
        })),

      clearCart: () => set({ cart: [], orderType: null }),

      // ── Order Submission ───────────────────────────────────

      submitOrder: async (orderData) => {
        set({ loading: true, error: null });

        try {
          const clientComputedTotal = orderData.items.reduce((sum, item) => {
            const itemTotal = (item.price + (item.optionsPrice || 0)) * item.quantity;
            return sum + itemTotal;
          }, 0);

          const orderPayload = {
            customer_name: orderData.customer_name,
            customer_phone: orderData.customer_phone,
            address: orderData.address,
            user_id: orderData.user_id,
            type: orderData.type,
            items: orderData.items.map(item => ({
              product_id: item.id,
              category_id: item.category_id,
              quantity: item.quantity,
              selected_option_ids: item.selectedOptionIds,
              special_instructions: item.specialInstructions,
            })),
            client_total: clientComputedTotal,
          };

          const response = await insforge.functions.invoke('place-order', {
            body: orderPayload,
          });

          if (response.error) {
            const err = response.error as any;
            const errorMsg = err.errors?.join('\n') || err.error || err.message || 'فشل إنشاء الطلب';
            throw new Error(errorMsg);
          }

          const result = response.data;

          if (!result || !result.success) {
            const errorMsg = result?.errors?.join('\n') || result?.error || 'فشل إنشاء الطلب';
            throw new Error(errorMsg);
          }

          set({ loading: false });
          return result.order_id;
        } catch (err: any) {
          set({ loading: false, error: err.message });
          console.error('Order submission failed:', err);
          return null;
        }
      },

      // ── Reorder ─────────────────────────────────────────────

      reorderFromHistory: (items) => {
        const { products, optionGroupsByProductId } = get();
        const added: CartItem[] = [];
        const skipped: string[] = [];

        for (const item of items) {
          const product = item.product_id
            ? products.find((p) => p.id === item.product_id)
            : null;

          if (product && product.is_available) {
            const sortedOptions = item.selected_option_ids?.slice().sort() || [];
            const optionsKey = sortedOptions.length > 0 ? sortedOptions.join(',') : '';

            let cartKey = product.id;
            if (item.special_instructions) {
              cartKey = optionsKey
                ? `${product.id}:${optionsKey}-${Date.now()}-${added.length}`
                : `${product.id}-${Date.now()}-${added.length}`;
            } else if (optionsKey) {
              cartKey = `${product.id}:${optionsKey}`;
            }

            const groups = optionGroupsByProductId[product.id] || [];
            const allOptions = groups.flatMap(g => g.options || []);
            const optionsPrice = sortedOptions.reduce((sum, optId) => {
              const opt = allOptions.find(o => o.id === optId);
              return sum + (opt?.price_delta || 0);
            }, 0);

            added.push({
              ...product,
              quantity: item.quantity,
              specialInstructions: item.special_instructions || undefined,
              selectedOptionIds: sortedOptions,
              optionsPrice,
              cartKey,
            });
          } else {
            skipped.push(item.name_ar);
          }
        }

        // Merge items with same cartKey
        const merged = new Map<string, CartItem>();
        for (const cartItem of added) {
          const existing = merged.get(cartItem.cartKey);
          if (existing) {
            existing.quantity += cartItem.quantity;
          } else {
            merged.set(cartItem.cartKey, { ...cartItem });
          }
        }

        set({ cart: Array.from(merged.values()), orderType: null });
        return { added: merged.size, skipped };
      },

      // ── Admin Actions ──────────────────────────────────────

      toggleAvailability: async (productId) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product) return;

        const newValue = !product.is_available;

        set((state) => ({
          products: state.products.map((p) =>
            p.id === productId ? { ...p, is_available: newValue } : p
          ),
        }));

        const { error } = await insforge.database
          .from('products')
          .update({ is_available: newValue })
          .eq('id', productId);

        if (error) {
          set((state) => ({
            products: state.products.map((p) =>
              p.id === productId ? { ...p, is_available: !newValue } : p
            ),
          }));
          console.error('Failed to toggle availability:', error);
        }
      },

      updateOrderStatus: async (orderId, status) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, status } : o
          ),
        }));

        const { error } = await insforge.database
          .from('orders')
          .update({ status })
          .eq('id', orderId);

        if (error) {
          console.error('Failed to update order status:', error);
          get().fetchOrders();
        }
      },

      updateProduct: async (id, data) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        }));

        const { error } = await insforge.database
          .from('products')
          .update(data)
          .eq('id', id);

        if (error) {
          console.error('Failed to update product:', error);
          get().fetchProducts();
        }
      },

      uploadProductImage: async (_productId, file) => {
        try {
          const ext = file.name.split('.').pop() || 'jpg';
          const fileName = `product-${_productId}-${Date.now()}.${ext}`;

          const { data, error } = await insforge.storage
            .from('menu-images')
            .upload(fileName, file);

          if (error || !data) {
            console.error('Failed to upload image:', error);
            return null;
          }

          return data.url;
        } catch (err: any) {
          console.error('Image upload failed:', err);
          return null;
        }
      },

      // ── Operational Control Actions ────────────────────────

      updateGlobalSettings: async (data) => {
        const current = get().globalSettings;
        if (!current) return;

        // Optimistic update
        set({ globalSettings: { ...current, ...data, updated_at: new Date().toISOString() } });

        const { error } = await insforge.database
          .from('global_settings')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', current.id);

        if (error) {
          console.error('Failed to update global settings:', error);
          set({ globalSettings: current }); // Rollback
        }
      },

      toggleCategoryActive: async (categoryId) => {
        const category = get().categories.find(c => c.id === categoryId);
        if (!category) return;

        const newValue = !category.is_active;

        set((state) => ({
          categories: state.categories.map(c =>
            c.id === categoryId ? { ...c, is_active: newValue } : c
          ),
        }));

        const { error } = await insforge.database
          .from('categories')
          .update({ is_active: newValue })
          .eq('id', categoryId);

        if (error) {
          set((state) => ({
            categories: state.categories.map(c =>
              c.id === categoryId ? { ...c, is_active: !newValue } : c
            ),
          }));
          console.error('Failed to toggle category active:', error);
        }
      },

      updateBusinessRule: async (categoryId, minQuantity) => {
        const existing = get().businessRules.find(r => r.category_id === categoryId);

        if (existing) {
          // Optimistic update
          set((state) => ({
            businessRules: state.businessRules.map(r =>
              r.category_id === categoryId ? { ...r, min_quantity: minQuantity } : r
            ),
          }));

          const { error } = await insforge.database
            .from('business_rules')
            .update({ min_quantity: minQuantity })
            .eq('category_id', categoryId);

          if (error) {
            console.error('Failed to update business rule:', error);
            get().fetchBusinessRules();
          }
        } else {
          // Insert new rule
          const { data, error } = await insforge.database
            .from('business_rules')
            .insert({ category_id: categoryId, min_quantity: minQuantity })
            .select();

          if (error) {
            console.error('Failed to create business rule:', error);
          } else if (data && data.length > 0) {
            set((state) => ({
              businessRules: [...state.businessRules, data[0]],
            }));
          }
        }
      },

      // ── Sauce Management ────────────────────────────────────

      fetchAllOptionGroups: async () => {
        const { data, error: gErr } = await insforge.database
          .from('product_option_groups')
          .select('*, options:product_options(*)')
          .order('sort_order', { ascending: true });

        if (gErr || !data) return;

        const enriched = data.map((group: any) => ({
          ...group,
          options: (group.options || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        }));

        set({ allOptionGroups: enriched });
      },

      toggleOptionActive: async (optionId) => {
        const allGroups = get().allOptionGroups;
        let currentActive = true;

        for (const g of allGroups) {
          const opt = g.options?.find(o => o.id === optionId);
          if (opt) { currentActive = opt.is_active; break; }
        }

        const newActive = !currentActive;

        // Optimistic update
        set({
          allOptionGroups: allGroups.map(g => ({
            ...g,
            options: g.options?.map(o => o.id === optionId ? { ...o, is_active: newActive } : o),
          })),
          optionGroupsByProductId: Object.fromEntries(
            Object.entries(get().optionGroupsByProductId).map(([productId, groups]) => [
              productId,
              groups.map(g => ({
                ...g,
                options: g.options?.map(o => o.id === optionId ? { ...o, is_active: newActive } : o),
              })),
            ])
          ),
        });

        const { error } = await insforge.database
          .from('product_options')
          .update({ is_active: newActive })
          .eq('id', optionId);

        if (error) {
          console.error('Failed to toggle option:', error);
          get().fetchAllOptionGroups();
          set({ optionGroupsByProductId: {}, optionGroupLoadingByProductId: {} });
        }
      },

      createOption: async (groupId, data) => {
        const group = get().allOptionGroups.find(g => g.id === groupId);
        const maxSort = Math.max(0, ...(group?.options?.map(o => o.sort_order) || []));

        const { data: rows, error } = await insforge.database
          .from('product_options')
          .insert({
            group_id: groupId,
            name_ar: data.name_ar,
            price_delta: data.price_delta,
            is_active: true,
            sort_order: maxSort + 1,
          })
          .select();

        if (error || !rows || rows.length === 0) {
          console.error('Failed to create option:', error);
          get().fetchAllOptionGroups();
          set({ optionGroupsByProductId: {}, optionGroupLoadingByProductId: {} });
          return null;
        }

        const newOption = rows[0] as ProductOption;
        set({
          allOptionGroups: get().allOptionGroups.map(g =>
            g.id === groupId ? { ...g, options: [...(g.options || []), newOption] } : g
          ),
          optionGroupsByProductId: Object.fromEntries(
            Object.entries(get().optionGroupsByProductId).map(([productId, groups]) => [
              productId,
              groups.map(g =>
                g.id === groupId ? { ...g, options: [...(g.options || []), newOption] } : g
              ),
            ])
          ),
        });
        return newOption;
      },

      updateOption: async (optionId, data) => {
        // Optimistic update
        set({
          allOptionGroups: get().allOptionGroups.map(g => ({
            ...g,
            options: g.options?.map(o => o.id === optionId ? { ...o, ...data } : o),
          })),
          optionGroupsByProductId: Object.fromEntries(
            Object.entries(get().optionGroupsByProductId).map(([productId, groups]) => [
              productId,
              groups.map(g => ({
                ...g,
                options: g.options?.map(o => o.id === optionId ? { ...o, ...data } : o),
              })),
            ])
          ),
        });

        const { error } = await insforge.database
          .from('product_options')
          .update(data)
          .eq('id', optionId);

        if (error) {
          console.error('Failed to update option:', error);
          get().fetchAllOptionGroups();
          set({ optionGroupsByProductId: {}, optionGroupLoadingByProductId: {} });
        }
      },

      deleteOption: async (optionId) => {
        // Optimistic delete
        set({
          allOptionGroups: get().allOptionGroups.map(g => ({
            ...g,
            options: g.options?.filter(o => o.id !== optionId),
          })),
          optionGroupsByProductId: Object.fromEntries(
            Object.entries(get().optionGroupsByProductId).map(([productId, groups]) => [
              productId,
              groups.map(g => ({
                ...g,
                options: g.options?.filter(o => o.id !== optionId),
              })),
            ])
          ),
        });

        const { error } = await insforge.database
          .from('product_options')
          .delete()
          .eq('id', optionId);

        if (error) {
          console.error('Failed to delete option:', error);
          get().fetchAllOptionGroups();
          set({ optionGroupsByProductId: {}, optionGroupLoadingByProductId: {} });
        }
      },
    }),
    {
      name: 'sushi-grill-cart',
      partialize: (state) => ({
        cart: state.cart,
        orderType: state.orderType,
      }),
    }
  )
);
