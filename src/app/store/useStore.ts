import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, updateDoc, collection, getDocs, query, where, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, isFirebaseConfigured } from '../../lib/firebase';
import { getStorage } from 'firebase/storage';
import { toast } from 'sonner';
import { broadcastSyncEvent } from '../utils/realtimeSync';
import { computeOptionsPrice } from '../utils/price';
import {
  categoriesService,
  productsService,
  settingsService,
  ordersService,
  getStoredOrders,
  saveOrdersToCache,
  mergeOrders,
  optionsService,
  getDefaultOptionGroups,
  saveCachedOptionGroups,
} from '../../services/firestore';
import {
  isBranchOpen,
  getBranchClosedMessage,
  isProductAvailableInBranch,
  isOptionAvailableInBranch,
} from '../utils/branchAvailability';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_OPTION_GROUPS_BY_PRODUCT,
  INITIAL_GLOBAL_SETTINGS,
  INITIAL_BUSINESS_RULES,
  createOptionGroupsForProduct,
} from '../../data/mockData';

const recentStoreSubmissions = new Map<string, { result: { orderId: string; orderNumber: number }; timestamp: number }>();

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
  branch_availability?: Record<string, boolean>;
  is_best_seller?: boolean;
  is_chef_pick?: boolean;
  badge?: string;
  ingredients_ar?: string[];
};

export type ProductOption = {
  id: string;
  group_id: string;
  key?: string;
  name_ar: string;
  price_delta: number;
  is_active: boolean;
  available?: boolean;
  branch_availability?: Record<string, boolean>;
  branchAvailability?: Record<string, boolean>;
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
  order_number?: number;
  customer_name: string;
  customer_phone: string;
  address?: string;
  user_id?: string;
  type: 'pickup' | 'delivery';
  branch?: string;
  subtotal?: number;
  delivery_fee?: number;
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

export type BranchOperationalStatus = {
  is_open: boolean;
  closed_message: string;
  auto_close_enabled?: boolean;
};

export type GlobalSettings = {
  id: string;
  is_website_open: boolean;
  closed_message: string;
  branches?: {
    'فرع الاستاد'?: BranchOperationalStatus;
    'فرع الكرفان'?: BranchOperationalStatus;
    [branchName: string]: BranchOperationalStatus | undefined;
  };
  created_at?: string;
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
  selectedBranch: string | null;
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
  fetchProductOptionGroups: (productId: string, forceReload?: boolean) => Promise<void>;
  invalidateOptionGroups: (productId: string) => void;
  fetchAllOptionGroups: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  resetOrdersState: () => void;
  fetchActiveOrder: () => Promise<void>;
  fetchGlobalSettings: () => Promise<void>;
  fetchBusinessRules: () => Promise<void>;

  // Real-Time Sync Setters
  setProducts: (products: Product[]) => void;
  setAllOptionGroups: (groups: OptionGroup[]) => void;
  setGlobalSettings: (settings: GlobalSettings) => void;
  updateProductAvailabilityLocal: (productId: string, is_available: boolean) => void;
  updateGlobalSettingsLocal: (data: Partial<GlobalSettings>) => void;

  // Cart Actions
  setOrderType: (type: 'pickup' | 'delivery') => void;
  setSelectedBranch: (branch: string | null) => void;
  removeUnavailableOptionsFromCart: (branch: string) => void;
  addToCart: (product: Product) => void;
  addToCartWithDetails: (product: Product, quantity: number, specialInstructions?: string, selectedOptionIds?: string[]) => void;
  removeFromCart: (cartKey: string) => void;
  updateQuantity: (cartKey: string, delta: number) => void;
  clearCart: () => void;

  // Order Actions
  submitOrder: (order: Omit<Order, 'id' | 'created_at' | 'status' | 'items'> & { items: CartItem[]; idempotency_key?: string }) => Promise<{ orderId: string; orderNumber: number } | null>;
  reorderFromHistory: (items: OrderItem[]) => { added: number; skipped: string[] };

  // Admin Actions
  toggleAvailability: (productId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  uploadProductImage: (productId: string, file: File) => Promise<string | null>;

  // Sauce Management
  toggleOptionActive: (optionId: string) => Promise<void>;
  toggleOptionBranchAvailability: (optionId: string, branch: string) => Promise<void>;
  createOption: (groupId: string, data: { name_ar: string; price_delta: number }) => Promise<ProductOption | null>;
  updateOption: (optionId: string, data: Partial<ProductOption>) => Promise<void>;
  deleteOption: (optionId: string) => Promise<void>;

  // Operational Control Actions
  updateGlobalSettings: (data: Partial<Pick<GlobalSettings, 'is_website_open' | 'closed_message' | 'branches'>>) => Promise<void>;
  updateBranchStatus: (branch: string, status: Partial<BranchOperationalStatus>) => Promise<void>;
  toggleCategoryActive: (categoryId: string) => Promise<void>;
  updateBusinessRule: (categoryId: string, minQuantity: number) => Promise<void>;
  toggleProductBranchAvailability: (productId: string, branch: string) => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      categories: INITIAL_CATEGORIES,
      products: INITIAL_PRODUCTS,
      optionGroupsByProductId: INITIAL_OPTION_GROUPS_BY_PRODUCT,
      optionGroupLoadingByProductId: {},
      allOptionGroups: getDefaultOptionGroups(),
      cart: [],
      orders: getStoredOrders(),
      orderType: null,
      selectedBranch: null,
      loading: false,
      error: null,
      globalSettings: INITIAL_GLOBAL_SETTINGS,
      businessRules: INITIAL_BUSINESS_RULES,
      activeOrder: null,

      // ── Data Fetching ──────────────────────────────────────

      fetchCategories: async () => {
        try {
          const categories = await categoriesService.getCategories();
          // Ensure all menu categories remain active/enabled by default
          const safeCategories = (categories && categories.length > 0 ? categories : INITIAL_CATEGORIES).map(c => ({
            ...c,
            is_active: true,
          }));
          set({ categories: safeCategories });
        } catch (err) {
          console.warn('Error fetching categories, fallback to initial categories:', err);
          set({ categories: INITIAL_CATEGORIES.map(c => ({ ...c, is_active: true })) });
        }
      },

      // ── Real-Time Sync Setters ──────────────────────────────

      setAllOptionGroups: (groups: OptionGroup[]) => {
        if (!groups || groups.length === 0) return;
        saveCachedOptionGroups(groups);
        set((state) => {
          const updatedGroupsByProduct: Record<string, OptionGroup[]> = {};
          for (const [prodId, pGroups] of Object.entries(state.optionGroupsByProductId)) {
            updatedGroupsByProduct[prodId] = pGroups.map((pg) => {
              const matched = groups.find((g) => g.id === pg.id);
              return matched ? matched : pg;
            });
          }
          return {
            allOptionGroups: groups,
            optionGroupsByProductId: Object.keys(updatedGroupsByProduct).length > 0 ? updatedGroupsByProduct : state.optionGroupsByProductId,
          };
        });
      },

      setProducts: (products: Product[]) => {
        if (!products || products.length === 0) return;

        const currentCart = get().cart;
        if (currentCart.length === 0) {
          set({ products });
          return;
        }

        const unavailableInCart: CartItem[] = [];
        const validCart: CartItem[] = [];

        for (const item of currentCart) {
          const matched = products.find((p) => p.id === item.id);
          if (matched && matched.is_available === false) {
            unavailableInCart.push(item);
          } else {
            validCart.push(item);
          }
        }

        if (unavailableInCart.length > 0) {
          set({ products, cart: validCart });
          unavailableInCart.forEach((item) => {
            toast.error('صنف غير متاح حالياً', {
              description: `عذراً، الصنف "${item.name_ar}" أصبح غير متاح حالياً وتمت إزالته من سلتك.`,
              duration: 6000,
            });
          });
        } else {
          set({ products });
        }
      },

      setGlobalSettings: (globalSettings: GlobalSettings) => {
        set({ globalSettings });
      },

      updateProductAvailabilityLocal: (productId: string, is_available: boolean) => {
        const updatedProducts = get().products.map((p) =>
          p.id === productId ? { ...p, is_available } : p
        );
        get().setProducts(updatedProducts);
      },

      updateGlobalSettingsLocal: (data: Partial<GlobalSettings>) => {
        const current = get().globalSettings;
        if (!current) return;
        set({ globalSettings: { ...current, ...data } });
      },

      fetchProducts: async () => {
        try {
          const products = await productsService.getProducts();
          get().setProducts(products);
        } catch (err) {
          console.warn('Error fetching products, fallback to initial products:', err);
          get().setProducts(INITIAL_PRODUCTS);
        }
      },

      fetchProductOptionGroups: async (productId: string, forceReload?: boolean) => {
        const state = get();
        // If allOptionGroups is already loaded and we have matching groups, use them directly
        if (!forceReload && state.allOptionGroups && state.allOptionGroups.length > 0) {
          const matching = state.allOptionGroups.filter(
            (g) => g.product_id === productId || g.product_id === 'all' || !g.product_id
          );
          if (matching.length > 0) {
            set((current) => ({
              optionGroupsByProductId: {
                ...current.optionGroupsByProductId,
                [productId]: matching,
              },
            }));
            return;
          }
        }

        set((current) => ({
          optionGroupLoadingByProductId: {
            ...current.optionGroupLoadingByProductId,
            [productId]: true,
          },
        }));

        try {
          const groups = await optionsService.getOptionGroups();
          get().setAllOptionGroups(groups);
          const matching = groups.filter(
            (g) => g.product_id === productId || g.product_id === 'all' || !g.product_id
          );
          set((current) => ({
            optionGroupsByProductId: {
              ...current.optionGroupsByProductId,
              [productId]: matching.length > 0 ? matching : (INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId)),
            },
            optionGroupLoadingByProductId: {
              ...current.optionGroupLoadingByProductId,
              [productId]: false,
            },
          }));
        } catch {
          const fallbackGroups = INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId);
          set((current) => ({
            optionGroupsByProductId: {
              ...current.optionGroupsByProductId,
              [productId]: fallbackGroups,
            },
            optionGroupLoadingByProductId: {
              ...current.optionGroupLoadingByProductId,
              [productId]: false,
            },
          }));
        }
      },

      invalidateOptionGroups: (productId: string) => {
        set((state) => {
          const next = { ...state.optionGroupsByProductId };
          delete next[productId];
          return { optionGroupsByProductId: next };
        });
      },

      fetchOrders: async () => {
        try {
          const authUser = auth?.currentUser;
          const isAdmin = typeof window !== 'undefined' && Boolean(localStorage.getItem('pochinki_admin_session'));

          let orders: Order[] = [];
          if (isAdmin) {
            orders = await ordersService.getAllOrders();
          } else if (authUser) {
            orders = await ordersService.getUserOrders(authUser.uid);
          } else {
            orders = await ordersService.getAllOrders();
          }

          if (orders && orders.length > 0) {
            set({ orders });
            saveOrdersToCache(orders);
          } else {
            set({ orders: [], activeOrder: null });
            saveOrdersToCache([]);
          }
        } catch (error) {
          console.error('Failed to fetch orders, retaining cached orders:', error);
        }
      },

      resetOrdersState: () => {
        saveOrdersToCache([]);
        set({ orders: [], activeOrder: null });
      },

      fetchActiveOrder: async () => {
        try {
          const authUser = auth?.currentUser;
          const isAdmin = typeof window !== 'undefined' && Boolean(localStorage.getItem('pochinki_admin_session'));

          let orders = get().orders;
          if (orders.length === 0) {
            if (isAdmin) {
              orders = await ordersService.getAllOrders();
            } else if (authUser) {
              orders = await ordersService.getUserOrders(authUser.uid);
            }
          }

          const active = orders.find(
            (o) => o.status !== 'completed' && o.status !== 'cancelled'
          );
          if (active) {
            set({ activeOrder: { id: active.id, status: active.status } });
          } else {
            set({ activeOrder: null });
          }
        } catch (error) {
          set({ activeOrder: null });
        }
      },

      fetchGlobalSettings: async () => {
        try {
          const globalSettings = await settingsService.getGlobalSettings();
          set({ globalSettings });
        } catch {
          set({ globalSettings: INITIAL_GLOBAL_SETTINGS });
        }
      },

      fetchBusinessRules: async () => {
        try {
          const businessRules = await settingsService.getBusinessRules();
          set({ businessRules });
        } catch {
          set({ businessRules: INITIAL_BUSINESS_RULES });
        }
      },

      // ── Cart Actions ───────────────────────────────────────

      setOrderType: (type) => set({ orderType: type }),

      setSelectedBranch: (branch) => set({ selectedBranch: branch }),

      removeUnavailableOptionsFromCart: (branch) => {
        const allGroups = [
          ...(get().allOptionGroups || []),
          ...Object.values(get().optionGroupsByProductId || {}).flat(),
        ];
        const allOptions = allGroups.flatMap((g) => g.options || []);

        set((state) => {
          let cartModified = false;
          const updatedCart = state.cart.map((item) => {
            if (!item.selectedOptionIds || item.selectedOptionIds.length === 0) {
              return item;
            }

            const filteredOptions = item.selectedOptionIds.filter((optId) => {
              const opt = allOptions.find((o) => o.id === optId);
              if (!opt) return true;
              return isOptionAvailableInBranch(opt, branch);
            });

            if (filteredOptions.length !== item.selectedOptionIds.length) {
              cartModified = true;
              const matchingGroups = allGroups.filter(
                (g) => !g.product_id || g.product_id === 'all' || g.product_id === item.id
              );
              const newOptionsPrice = computeOptionsPrice(filteredOptions, matchingGroups);
              const sorted = filteredOptions.slice().sort();
              const newCartKey = sorted.length > 0 ? `${item.id}:${sorted.join(',')}` : item.id;

              return {
                ...item,
                selectedOptionIds: filteredOptions,
                optionsPrice: newOptionsPrice,
                cartKey: item.specialInstructions ? `${newCartKey}-${Date.now()}` : newCartKey,
              };
            }
            return item;
          });

          if (!cartModified) return state;

          return { cart: updatedCart };
        });
      },

      addToCart: (product) =>
        set((state) => {
          // Guard: website closed
          if (state.globalSettings && state.globalSettings.is_website_open === false) return state;
          // Guard: category inactive
          const category = state.categories.find(c => c.id === product.category_id);
          if (category && category.is_active === false) return state;
          // Guard: product unavailable
          if (product.is_available === false) return state;

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
          if (state.globalSettings && state.globalSettings.is_website_open === false) return state;
          // Guard: category inactive
          const category = state.categories.find(c => c.id === product.category_id);
          if (category && category.is_active === false) return state;
          // Guard: product unavailable
          if (product.is_available === false) return state;

          const trimmedNote = specialInstructions?.trim().slice(0, 200) || undefined;
          const sortedOptions = selectedOptionIds?.slice().sort() || [];
          const optionsKey = sortedOptions.length > 0 ? sortedOptions.join(',') : '';

          const groups = state.optionGroupsByProductId[product.id] || [];
          const optionsPrice = computeOptionsPrice(sortedOptions, groups);

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
        // Concurrency guard: reject duplicate parallel executions if submission is already in progress
        if (get().loading) {
          console.warn('[Store] Duplicate submitOrder call blocked: submission is already in progress');
          return null;
        }

        const idempotencyKey = orderData.idempotency_key || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Check recent submission cache (10s window)
        const cachedSub = recentStoreSubmissions.get(idempotencyKey);
        if (cachedSub && (Date.now() - cachedSub.timestamp < 10000)) {
          console.warn('[Store] Duplicate submission intercepted by idempotency guard in store. Returning order #', cachedSub.result.orderNumber);
          return cachedSub.result;
        }

        set({ loading: true, error: null });

        try {
          // ── Strict Pre-Checkout Validation 1: Fresh Site Status ──
          let freshSettings = get().globalSettings;
          if (isFirebaseConfigured() && db) {
            try {
              freshSettings = await settingsService.getGlobalSettings();
              set({ globalSettings: freshSettings });
            } catch (settingsErr) {
              console.warn('[Validation] Could not fetch fresh settings:', settingsErr);
            }
          }

          if (freshSettings && !freshSettings.is_website_open) {
            const errorMsg = freshSettings.closed_message || 'عذراً، المطعم مغلق حالياً ولا يستقبل طلبات جديدة.';
            set({ loading: false, error: errorMsg });
            return null;
          }

          // Branch closed validation
          if (orderData.branch && !isBranchOpen(freshSettings, orderData.branch)) {
            const errorMsg = getBranchClosedMessage(freshSettings, orderData.branch) || `${orderData.branch} مغلق حالياً ولا يستقبل طلبات جديدة.`;
            set({ loading: false, error: errorMsg });
            return null;
          }

          // ── Strict Pre-Checkout Validation 2: Fresh Product Availability ──
          let freshProducts = get().products;
          if (isFirebaseConfigured() && db) {
            try {
              freshProducts = await productsService.getProducts();
              get().setProducts(freshProducts);
            } catch (prodErr) {
              console.warn('[Validation] Could not fetch fresh products:', prodErr);
            }
          }

          const unavailableItems: string[] = [];
          for (const item of orderData.items) {
            const prod = freshProducts.find((p) => p.id === item.id);
            if (!prod || !prod.is_available || (orderData.branch && !isProductAvailableInBranch(prod, orderData.branch))) {
              unavailableItems.push(item.name_ar);
            }
          }

          // Validate options/sauces availability in selected branch
          const allOptions = [
            ...(get().allOptionGroups || []).flatMap((g) => g.options || []),
            ...Object.values(get().optionGroupsByProductId || {}).flatMap((groups) => groups.flatMap((g) => g.options || [])),
          ];
          const unavailableOptions: string[] = [];
          for (const item of orderData.items) {
            if (item.selectedOptionIds && item.selectedOptionIds.length > 0) {
              for (const optId of item.selectedOptionIds) {
                const opt = allOptions.find((o) => o.id === optId);
                if (opt) {
                  if (!isOptionAvailableInBranch(opt, orderData.branch)) {
                    unavailableOptions.push(opt.name_ar);
                  }
                }
              }
            }
          }

          if (unavailableOptions.length > 0) {
            const errorMsg = orderData.branch
              ? `عذراً، الإضافة "${unavailableOptions.join('، ')}" غير متاحة حالياً في ${orderData.branch}. يرجى تعديل السلة.`
              : `عذراً، الإضافة "${unavailableOptions.join('، ')}" غير متاحة حالياً. يرجى تعديل السلة.`;
            set({ loading: false, error: errorMsg });
            return null;
          }

          if (unavailableItems.length > 0) {
            // Remove globally unavailable items from the cart automatically
            const cleanedCart = get().cart.filter((cartItem) => {
              const prod = freshProducts.find((p) => p.id === cartItem.id);
              return prod && prod.is_available;
            });
            const errorMsg = orderData.branch
              ? `عذراً، الصنف "${unavailableItems.join('، ')}" غير متاح حالياً في ${orderData.branch}.`
              : `عذراً، الصنف "${unavailableItems.join('، ')}" أصبح غير متاح حالياً وتم تعديل سلتك.`;
            set({ cart: cleanedCart, loading: false, error: errorMsg });
            return null;
          }

          if (orderData.items.length === 0) {
            set({ loading: false, error: 'سلة المشتريات فارغة' });
            return null;
          }

          const result = await ordersService.createOrder({
            customer_name: orderData.customer_name,
            customer_phone: orderData.customer_phone,
            address: orderData.address,
            user_id: orderData.user_id,
            type: orderData.type,
            branch: orderData.branch,
            total: orderData.total || 0,
            subtotal: orderData.total || 0,
            status: 'new',
            idempotency_key: idempotencyKey,
            raw_items: orderData.items,
            items: orderData.items.map((item) => ({
              id: 'item_' + Math.random().toString(36).substring(2, 7),
              product_id: item.id,
              name_ar: item.name_ar,
              quantity: item.quantity,
              unit_price: (item.price ?? 0) + (item.optionsPrice ?? 0),
              selected_option_ids: item.selectedOptionIds,
              special_instructions: item.specialInstructions,
            })),
          });

          recentStoreSubmissions.set(idempotencyKey, {
            result,
            timestamp: Date.now(),
          });

          // Optimistically update orders in store with new order so admin/user sees it instantly
          const newOrder: Order = {
            id: result.orderId,
            order_number: result.orderNumber,
            customer_name: orderData.customer_name,
            customer_phone: orderData.customer_phone,
            address: orderData.address,
            user_id: orderData.user_id,
            type: orderData.type,
            branch: orderData.branch,
            total: orderData.total || 0,
            status: 'new',
            created_at: new Date().toISOString(),
            items: orderData.items.map((item) => ({
              id: 'item_' + Math.random().toString(36).substring(2, 7),
              product_id: item.id,
              name_ar: item.name_ar,
              quantity: item.quantity,
              unit_price: (item.price ?? 0) + (item.optionsPrice ?? 0),
              selected_option_ids: item.selectedOptionIds,
              special_instructions: item.specialInstructions,
            })),
          };

          set((state) => {
            const updated = [newOrder, ...state.orders.filter((o) => o.id !== result.orderId)];
            saveOrdersToCache(updated);
            return { orders: updated, loading: false };
          });

          broadcastSyncEvent({
            type: 'ORDER_EVENT_NOTIFICATION',
            orderId: result.orderId,
            action: 'created',
          });
          broadcastSyncEvent({
            type: 'ORDER_CREATED',
            order: newOrder,
          });

          return result;
        } catch (err: any) {
          set({ loading: false, error: err.message || 'فشل إنشاء الطلب' });
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
            const optionsPrice = groups.length === 0 && item.unit_price != null
              ? Math.max(0, item.unit_price - (product.price ?? 0))
              : computeOptionsPrice(sortedOptions, groups);

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
        get().updateProductAvailabilityLocal(productId, newValue);

        broadcastSyncEvent({
          type: 'PRODUCT_AVAILABILITY_CHANGED',
          productId,
          is_available: newValue,
        });

        if (!isFirebaseConfigured() || !db) return;
        try {
          await updateDoc(doc(db, 'products', productId), { is_available: newValue });
        } catch (error) {
          get().updateProductAvailabilityLocal(productId, !newValue);
          console.error('Failed to toggle availability:', error);
        }
      },

      updateOrderStatus: async (orderId, status) => {
        const targetOrder = get().orders.find((o) => o.id === orderId);

        set((state) => {
          const updated = state.orders.map((o) =>
            o.id === orderId ? { ...o, status } : o
          );
          saveOrdersToCache(updated);
          const activeOrder =
            state.activeOrder && state.activeOrder.id === orderId
              ? { ...state.activeOrder, status }
              : state.activeOrder;
          return { orders: updated, activeOrder };
        });

        // Broadcast to all other tabs via BroadcastChannel & LocalStorage
        broadcastSyncEvent({
          type: 'ORDER_STATUS_CHANGED',
          orderId,
          status,
        });

        if (targetOrder?.order_number) {
          broadcastSyncEvent({
            type: 'ORDER_STATUS_CHANGED',
            orderId: String(targetOrder.order_number),
            status,
          });
          broadcastSyncEvent({
            type: 'ORDER_STATUS_CHANGED',
            orderId: `#${targetOrder.order_number}`,
            status,
          });
        }

        try {
          await ordersService.updateOrderStatus(orderId, status);
          broadcastSyncEvent({
            type: 'ORDER_EVENT_NOTIFICATION',
            orderId,
            action: 'status_changed',
          });
        } catch (error) {
          console.error('Failed to update order status:', error);
          get().fetchOrders();
        }
      },

      updateProduct: async (id, data) => {
        const currentProducts = get().products;
        const updated = currentProducts.map((p) =>
          p.id === id ? { ...p, ...data } : p
        );
        get().setProducts(updated);

        if (data.is_available !== undefined) {
          broadcastSyncEvent({
            type: 'PRODUCT_AVAILABILITY_CHANGED',
            productId: id,
            is_available: data.is_available,
          });
        } else {
          broadcastSyncEvent({
            type: 'PRODUCT_UPDATED',
            productId: id,
            data,
          });
        }

        if (!isFirebaseConfigured() || !db) return;
        try {
          await updateDoc(doc(db, 'products', id), data);
        } catch (error) {
          console.error('Failed to update product:', error);
          get().fetchProducts();
        }
      },

      uploadProductImage: async (_productId, file) => {
        if (!isFirebaseConfigured()) return null;
        try {
          const storage = getStorage();
          const ext = file.name.split('.').pop() || 'jpg';
          const fileName = `menu-images/product-${_productId}-${Date.now()}.${ext}`;
          const storageRef = ref(storage, fileName);

          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          return url;
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

        broadcastSyncEvent({
          type: 'GLOBAL_SETTINGS_CHANGED',
          settings: data,
        });

        if (!isFirebaseConfigured() || !db) return;
        try {
          await settingsService.updateGlobalSettings(data);
        } catch (error) {
          console.error('Failed to update global settings:', error);
          set({ globalSettings: current }); // Rollback
        }
      },

      updateBranchStatus: async (branch, status) => {
        const current = get().globalSettings;
        if (!current) return;

        const existingBranch = current.branches?.[branch] || {
          is_open: true,
          closed_message: `${branch} مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.`,
        };

        const updatedBranches = {
          ...(current.branches || {}),
          [branch]: {
            ...existingBranch,
            ...status,
          },
        };

        await get().updateGlobalSettings({ branches: updatedBranches });
      },

      toggleProductBranchAvailability: async (productId, branch) => {
        const product = get().products.find(p => p.id === productId);
        if (!product) return;

        const isCurrentBranchAvailable = isProductAvailableInBranch(product, branch);

        const nextBranchMap = {
          ...(product.branch_availability || {}),
          [branch]: !isCurrentBranchAvailable,
        };

        await get().updateProduct(productId, { branch_availability: nextBranchMap });
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

        if (!isFirebaseConfigured() || !db) return;
        try {
          await updateDoc(doc(db, 'categories', categoryId), { is_active: newValue });
        } catch (error) {
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

        if (!isFirebaseConfigured() || !db) return;

        if (existing) {
          // Optimistic update
          set((state) => ({
            businessRules: state.businessRules.map(r =>
              r.category_id === categoryId ? { ...r, min_quantity: minQuantity } : r
            ),
          }));

          try {
            await updateDoc(doc(db, 'business_rules', existing.id || categoryId), { min_quantity: minQuantity });
          } catch (error) {
            console.error('Failed to update business rule:', error);
            get().fetchBusinessRules();
          }
        } else {
          // Insert new rule
          try {
            const newDocRef = await addDoc(collection(db, 'business_rules'), {
              category_id: categoryId,
              min_quantity: minQuantity,
            });
            set((state) => ({
              businessRules: [...state.businessRules, {
                id: newDocRef.id,
                category_id: categoryId,
                min_quantity: minQuantity,
              }],
            }));
          } catch (error) {
            console.error('Failed to create business rule:', error);
          }
        }
      },

      // ── Sauce Management ────────────────────────────────────

      fetchAllOptionGroups: async () => {
        try {
          const groups = await optionsService.getOptionGroups();
          get().setAllOptionGroups(groups);
        } catch (error) {
          console.warn('[useStore] Error fetching all option groups:', error);
          get().setAllOptionGroups(getDefaultOptionGroups());
        }
      },

      toggleOptionActive: async (optionId) => {
        const currentGroups = get().allOptionGroups;
        let targetOption: ProductOption | undefined;
        for (const g of currentGroups) {
          const opt = g.options?.find((o) => o.id === optionId);
          if (opt) {
            targetOption = opt;
            break;
          }
        }
        if (!targetOption) return;

        const newActive = !(targetOption.is_active !== false && (targetOption as any).available !== false);
        const updatedGroups = currentGroups.map((g) => ({
          ...g,
          options: g.options?.map((o) =>
            o.id === optionId ? { ...o, is_active: newActive, available: newActive } : o
          ),
        }));

        get().setAllOptionGroups(updatedGroups);
        broadcastSyncEvent({ type: 'OPTIONS_UPDATED', optionGroups: updatedGroups });

        try {
          await optionsService.updateOption(optionId, {
            ...targetOption,
            is_active: newActive,
            available: newActive,
          });
        } catch (error) {
          console.error('[useStore] Failed to toggle option in Firestore:', error);
        }
      },

      toggleOptionBranchAvailability: async (optionId: string, branch: string) => {
        const currentGroups = get().allOptionGroups;
        let targetOption: ProductOption | undefined;
        for (const g of currentGroups) {
          const found = g.options?.find((o) => o.id === optionId);
          if (found) {
            targetOption = found;
            break;
          }
        }
        if (!targetOption) return;

        const isCurrentBranchAvailable = isOptionAvailableInBranch(targetOption, branch);
        const nextVal = !isCurrentBranchAvailable;

        // Ensure both branches are explicitly preserved so undefined keys never overwrite default true
        const existingBranchMap = {
          'فرع الاستاد': isOptionAvailableInBranch(targetOption, 'فرع الاستاد'),
          'فرع الكرفان': isOptionAvailableInBranch(targetOption, 'فرع الكرفان'),
          ...(targetOption.branch_availability || {}),
          ...((targetOption as any).branchAvailability || {}),
        };

        const nextBranchMap = {
          ...existingBranchMap,
          [branch]: nextVal,
        };

        const updatePayload: Partial<ProductOption> = {
          branch_availability: nextBranchMap,
          branchAvailability: nextBranchMap,
        };
        if (nextVal && (targetOption.is_active === false || (targetOption as any).available === false)) {
          updatePayload.is_active = true;
          updatePayload.available = true;
        }

        await get().updateOption(optionId, updatePayload);
      },

      createOption: async (groupId, data) => {
        const currentGroups = get().allOptionGroups;
        const group = currentGroups.find((g) => g.id === groupId);
        const maxSort = Math.max(0, ...(group?.options?.map((o) => o.sort_order ?? 0) || []));

        const tempId = 'opt_' + Date.now();
        const initialBranchAvail = { 'فرع الاستاد': true, 'فرع الكرفان': true };
        const newOption: ProductOption = {
          id: tempId,
          group_id: groupId,
          name_ar: data.name_ar,
          price_delta: data.price_delta,
          is_active: true,
          available: true,
          branch_availability: initialBranchAvail,
          branchAvailability: initialBranchAvail,
          sort_order: maxSort + 1,
        };

        let updatedGroups = currentGroups.map((g) =>
          g.id === groupId ? { ...g, options: [...(g.options || []), newOption] } : g
        );
        get().setAllOptionGroups(updatedGroups);

        try {
          const realId = await optionsService.createOption(groupId, {
            name_ar: data.name_ar,
            price_delta: data.price_delta,
            is_active: true,
            available: true,
            branch_availability: initialBranchAvail,
            branchAvailability: initialBranchAvail,
            sort_order: maxSort + 1,
          });

          updatedGroups = updatedGroups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  options: g.options?.map((o) => (o.id === tempId ? { ...o, id: realId } : o)),
                }
              : g
          );
          get().setAllOptionGroups(updatedGroups);
          broadcastSyncEvent({ type: 'OPTIONS_UPDATED', optionGroups: updatedGroups });
          return { ...newOption, id: realId };
        } catch (error) {
          console.error('[useStore] Failed to create option in Firestore:', error);
          broadcastSyncEvent({ type: 'OPTIONS_UPDATED', optionGroups: updatedGroups });
          return newOption;
        }
      },

      updateOption: async (optionId, data) => {
        const currentGroups = get().allOptionGroups;
        let targetOption: ProductOption | undefined;
        for (const g of currentGroups) {
          const found = g.options?.find((o) => o.id === optionId);
          if (found) {
            targetOption = found;
            break;
          }
        }

        const mergedData: Partial<ProductOption> = { ...data };
        if (data.branch_availability && !data.branchAvailability) {
          mergedData.branchAvailability = data.branch_availability;
        } else if (data.branchAvailability && !data.branch_availability) {
          mergedData.branch_availability = data.branchAvailability;
        }
        if (typeof data.is_active === 'boolean' && typeof data.available !== 'boolean') {
          mergedData.available = data.is_active;
        } else if (typeof data.available === 'boolean' && typeof data.is_active !== 'boolean') {
          mergedData.is_active = data.available;
        }

        const updatedGroups = currentGroups.map((g) => ({
          ...g,
          options: g.options?.map((o) => (o.id === optionId ? { ...o, ...mergedData } : o)),
        }));

        saveCachedOptionGroups(updatedGroups);
        get().setAllOptionGroups(updatedGroups);
        broadcastSyncEvent({ type: 'OPTIONS_UPDATED', optionGroups: updatedGroups });

        try {
          const firestorePayload: any = {
            ...(mergedData.branch_availability ? { branch_availability: mergedData.branch_availability, branchAvailability: mergedData.branchAvailability } : {}),
            ...(typeof mergedData.is_active === 'boolean' ? { is_active: mergedData.is_active, available: mergedData.available } : {}),
            ...(mergedData.name_ar ? { name_ar: mergedData.name_ar } : {}),
            ...(typeof mergedData.price_delta === 'number' ? { price_delta: mergedData.price_delta } : {}),
          };
          await optionsService.updateOption(optionId, firestorePayload);
        } catch (error) {
          console.error('[useStore] Failed to update option in Firestore:', error);
        }
      },

      deleteOption: async (optionId) => {
        const currentGroups = get().allOptionGroups;
        const updatedGroups = currentGroups.map((g) => ({
          ...g,
          options: g.options?.filter((o) => o.id !== optionId),
        }));

        get().setAllOptionGroups(updatedGroups);
        broadcastSyncEvent({ type: 'OPTIONS_UPDATED', optionGroups: updatedGroups });

        try {
          await optionsService.deleteOption(optionId);
        } catch (error) {
          console.error('[useStore] Failed to delete option in Firestore:', error);
        }
      },
    }),
    {
      name: 'pochinki-burger-cart',
      partialize: (state) => ({
        cart: state.cart,
        orderType: state.orderType,
        selectedBranch: state.selectedBranch,
        orders: state.orders,
      }),
    }
  )
);

// Cross-tab and window listener for clean reset events
if (typeof window !== 'undefined') {
  window.addEventListener('pochinki_orders_cleared', () => {
    useStore.getState().resetOrdersState();
  });
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('pochinki_sync_channel');
      channel.addEventListener('message', (event) => {
        if (event.data?.type === 'orders_cleared') {
          useStore.getState().resetOrdersState();
        }
      });
    } catch {
      // ignore
    }
  }
}

