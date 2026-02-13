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

export type CartItem = Product & {
  quantity: number;
  specialInstructions?: string;
  cartKey: string;
};

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'completed';

export type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  address?: string;
  type: 'pickup' | 'delivery';
  items: CartItem[];
  total: number;
  status: OrderStatus;
  created_at: string;
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
  cart: CartItem[];
  orders: Order[];
  orderType: 'pickup' | 'delivery' | null;
  loading: boolean;
  error: string | null;

  // Operational Controls
  globalSettings: GlobalSettings | null;
  businessRules: BusinessRule[];

  // Data Fetching
  fetchCategories: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchGlobalSettings: () => Promise<void>;
  fetchBusinessRules: () => Promise<void>;

  // Cart Actions
  setOrderType: (type: 'pickup' | 'delivery') => void;
  addToCart: (product: Product) => void;
  addToCartWithDetails: (product: Product, quantity: number, specialInstructions?: string) => void;
  removeFromCart: (cartKey: string) => void;
  updateQuantity: (cartKey: string, delta: number) => void;
  clearCart: () => void;

  // Order Actions
  submitOrder: (order: Omit<Order, 'id' | 'created_at' | 'status' | 'items'> & { items: CartItem[] }) => Promise<string | null>;

  // Admin Actions
  toggleAvailability: (productId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  uploadProductImage: (productId: string, file: File) => Promise<string | null>;

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
      cart: [],
      orders: [],
      orderType: null,
      loading: false,
      error: null,
      globalSettings: null,
      businessRules: [],

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
                id: item.product_id || item.id,
                name_ar: item.name_ar,
                quantity: item.quantity,
                price: item.unit_price,
                name_en: '',
                description_ar: '',
                category_id: '',
                image_url: '',
                is_available: true,
              })),
            };
          })
        );

        set({ orders: ordersWithItems });
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
                item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item
              ),
            };
          }
          return { cart: [...state.cart, { ...product, quantity: 1, cartKey }] };
        }),

      addToCartWithDetails: (product, quantity, specialInstructions) =>
        set((state) => {
          // Guard: website closed
          if (state.globalSettings && !state.globalSettings.is_website_open) return state;
          // Guard: category inactive
          const category = state.categories.find(c => c.id === product.category_id);
          if (category && !category.is_active) return state;
          // Guard: product unavailable
          if (!product.is_available) return state;

          const trimmedNote = specialInstructions?.trim().slice(0, 200) || undefined;

          // If no note, merge with existing no-note entry
          if (!trimmedNote) {
            const cartKey = product.id;
            const existing = state.cart.find((item) => item.cartKey === cartKey);
            if (existing) {
              return {
                cart: state.cart.map((item) =>
                  item.cartKey === cartKey ? { ...item, quantity: item.quantity + quantity } : item
                ),
              };
            }
            return { cart: [...state.cart, { ...product, quantity, cartKey }] };
          }

          // With note → always a new cart entry with unique key
          const cartKey = `${product.id}-${Date.now()}`;
          return {
            cart: [...state.cart, { ...product, quantity, specialInstructions: trimmedNote, cartKey }],
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
          // 1. Server-side validation via Edge Function
          const validationPayload = {
            items: orderData.items.map(item => ({
              product_id: item.id,
              category_id: item.category_id,
              quantity: item.quantity,
            })),
          };

          const validationResponse = await insforge.functions.invoke('validate-order', {
            body: validationPayload,
          });

          if (validationResponse.error) {
            // SDK error (network failure, unexpected status code)
            const err = validationResponse.error as any;
            const errorMsg = err.errors?.join('\n') || err.error || err.message || 'فشل التحقق من الطلب';
            throw new Error(errorMsg);
          }

          if (validationResponse.data && !validationResponse.data.valid) {
            // Successful response but validation failed
            const errorData = validationResponse.data;
            const errorMsg = errorData.errors?.join('\n') || errorData.error || 'فشل التحقق من الطلب';
            throw new Error(errorMsg);
          }

          // 2. Insert the order
          const { data: orderResult, error: orderError } = await insforge.database
            .from('orders')
            .insert({
              customer_name: orderData.customer_name,
              customer_phone: orderData.customer_phone,
              address: orderData.address || null,
              type: orderData.type,
              total: orderData.total,
              status: 'new',
            })
            .select()

          if (orderError || !orderResult || orderResult.length === 0) {
            throw new Error(orderError?.message || 'Failed to create order');
          }

          const newOrder = orderResult[0];

          // 3. Insert order items
          const itemsToInsert = orderData.items.map((item) => ({
            order_id: newOrder.id,
            product_id: item.id,
            name_ar: item.name_ar,
            quantity: item.quantity,
            unit_price: item.price,
            special_instructions: item.specialInstructions || null,
          }));

          const { error: itemsError } = await insforge.database
            .from('order_items')
            .insert(itemsToInsert);

          if (itemsError) {
            throw new Error(itemsError?.message || 'Failed to save order items');
          }

          set({ loading: false });
          return newOrder.id;
        } catch (err: any) {
          set({ loading: false, error: err.message });
          console.error('Order submission failed:', err);
          return null;
        }
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
