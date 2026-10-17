export const ALLOWED_BRANCHES = ['فرع الاستاد', 'فرع الكرفان'] as const;
export type AllowedBranch = (typeof ALLOWED_BRANCHES)[number];

export const MAX_LINE_ITEMS = 25;
export const MAX_QUANTITY = 20;
export const MAX_SPECIAL_INSTRUCTIONS = 300;
export const DEFAULT_DELIVERY_FEE = 25;

export interface CatalogProduct {
  id: string;
  name_ar?: string;
  price?: number;
  is_available?: boolean;
  branch_availability?: Record<string, boolean>;
}

export interface CatalogOption {
  id: string;
  name_ar?: string;
  price?: number;
  price_delta?: number;
  is_active?: boolean;
  group_id?: string;
}

export interface CatalogOptionGroup {
  id: string;
  product_id?: string;
  is_active?: boolean;
  min_select?: number;
  max_select?: number;
}

export interface CatalogSettings {
  is_website_open?: boolean;
  is_open?: boolean;
  closed_message?: string;
  delivery_fee?: number;
  min_order_amount?: number;
  allow_delivery?: boolean;
  allow_pickup?: boolean;
  allow_guest_checkout?: boolean;
  branches?: Record<
    string,
    {
      is_open?: boolean;
      closed_message?: string;
      delivery_fee?: number;
    }
  >;
}

export interface IncomingCartItem {
  id?: string;
  name_ar?: string;
  quantity?: number;
  price?: number;
  optionsPrice?: number;
  selectedOptionIds?: string[];
  specialInstructions?: string;
}

export interface VerifiedOrderItem {
  id: string;
  product_id: string;
  name_ar: string;
  quantity: number;
  unit_price: number;
  selected_option_ids: string[];
  special_instructions: string;
}

export interface PricingSuccess {
  isValid: true;
  subtotal: number;
  deliveryFee: number;
  total: number;
  verifiedItems: VerifiedOrderItem[];
}

export interface PricingFailure {
  isValid: false;
  error: string;
  subtotal: 0;
  deliveryFee: 0;
  total: 0;
  verifiedItems: [];
}

export type PricingResult = PricingSuccess | PricingFailure;

function fail(error: string): PricingFailure {
  return { isValid: false, error, subtotal: 0, deliveryFee: 0, total: 0, verifiedItems: [] };
}

export function isAllowedBranch(branch: string): branch is AllowedBranch {
  return (ALLOWED_BRANCHES as readonly string[]).includes(branch);
}

export function optionUnitPrice(option: CatalogOption): number {
  if (typeof option.price === 'number' && Number.isFinite(option.price)) {
    return option.price;
  }
  if (typeof option.price_delta === 'number' && Number.isFinite(option.price_delta)) {
    return option.price_delta;
  }
  return 0;
}

export function priceOrderFromCatalog(input: {
  type: 'pickup' | 'delivery';
  branch: string;
  items: IncomingCartItem[];
  settings: CatalogSettings | null;
  products: Map<string, CatalogProduct>;
  options: Map<string, CatalogOption>;
  optionGroups: Map<string, CatalogOptionGroup>;
  itemIdFactory?: () => string;
}): PricingResult {
  const { type, branch, items, settings, products, options, optionGroups } = input;
  const nextItemId = input.itemIdFactory ?? (() => `item_${Math.random().toString(36).slice(2, 9)}`);

  if (!items || items.length === 0) {
    return fail('سلة المشتريات فارغة');
  }
  if (items.length > MAX_LINE_ITEMS) {
    return fail('عدد الأصناف في الطلب أكبر من المسموح');
  }
  if (!isAllowedBranch(branch)) {
    return fail('يرجى اختيار فرع صالح');
  }

  const websiteOpen = settings?.is_website_open ?? settings?.is_open ?? true;
  if (settings && websiteOpen === false) {
    return fail(settings.closed_message || 'عذراً، المطعم مغلق حالياً ولا يستقبل طلبات جديدة.');
  }

  if (type === 'delivery' && settings?.allow_delivery === false) {
    return fail('التوصيل غير متاح حالياً');
  }
  if (type === 'pickup' && settings?.allow_pickup === false) {
    return fail('الاستلام من الفرع غير متاح حالياً');
  }

  const branchConfig = settings?.branches?.[branch];
  if (branchConfig && branchConfig.is_open === false) {
    return fail(branchConfig.closed_message || `${branch} مغلق حالياً ولا يستقبل طلبات جديدة.`);
  }

  const verifiedItems: VerifiedOrderItem[] = [];
  let subtotal = 0;
  const groupCounts = new Map<string, number>();

  for (const item of items) {
    if (!item.id || typeof item.id !== 'string') {
      return fail('صنف غير معروف في السلة');
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return fail('كمية غير صالحة لأحد الأصناف');
    }

    const product = products.get(item.id);
    if (!product) {
      return fail(`الصنف "${item.name_ar || item.id}" لم يعد موجوداً في القائمة`);
    }
    if (product.is_available === false) {
      return fail(`الصنف "${product.name_ar || item.name_ar}" غير متاح حالياً`);
    }
    if (product.branch_availability && product.branch_availability[branch] === false) {
      return fail(`الصنف "${product.name_ar || item.name_ar}" غير متاح في ${branch}`);
    }

    const selectedOptionIds = Array.isArray(item.selectedOptionIds)
      ? Array.from(new Set(item.selectedOptionIds.filter((id) => typeof id === 'string' && id.length > 0)))
      : [];

    let optionsTotal = 0;
    for (const optionId of selectedOptionIds) {
      const option = options.get(optionId);
      if (!option || option.is_active === false) {
        return fail('أحد إضافات الطلب غير صالح أو غير متاح');
      }
      if (!option.group_id) {
        return fail('أحد إضافات الطلب غير مرتبط بمجموعة خيارات');
      }
      const group = optionGroups.get(option.group_id);
      if (!group || group.is_active === false || (group.product_id && group.product_id !== product.id && group.product_id !== 'all')) {
        return fail('أحد إضافات الطلب لا ينتمي لهذا الصنف');
      }
      const countKey = `${product.id}:${group.id}`;
      groupCounts.set(countKey, (groupCounts.get(countKey) || 0) + 1);
      const maxSelect = typeof group.max_select === 'number' ? group.max_select : 99;
      if (groupCounts.get(countKey)! > maxSelect) {
        return fail('تم تجاوز الحد الأقصى لإضافات أحد الأصناف');
      }
      optionsTotal += optionUnitPrice(option);
    }

    const basePrice = Number(product.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return fail('سعر الصنف غير صالح في السجلات المعتمدة');
    }

    const unitPrice = basePrice + optionsTotal;
    subtotal += unitPrice * quantity;

    const special =
      typeof item.specialInstructions === 'string'
        ? item.specialInstructions.trim().slice(0, MAX_SPECIAL_INSTRUCTIONS)
        : '';

    verifiedItems.push({
      id: nextItemId(),
      product_id: product.id,
      name_ar: product.name_ar || item.name_ar || product.id,
      quantity,
      unit_price: unitPrice,
      selected_option_ids: selectedOptionIds,
      special_instructions: special,
    });
  }

  let deliveryFee = 0;
  if (type === 'delivery') {
    const branchFee = branchConfig?.delivery_fee;
    const globalFee = settings?.delivery_fee;
    deliveryFee =
      typeof branchFee === 'number' && Number.isFinite(branchFee)
        ? branchFee
        : typeof globalFee === 'number' && Number.isFinite(globalFee)
          ? globalFee
          : DEFAULT_DELIVERY_FEE;
    if (deliveryFee < 0) {
      return fail('رسوم التوصيل غير صالحة');
    }
  }

  const minOrder = typeof settings?.min_order_amount === 'number' ? settings.min_order_amount : 0;
  if (minOrder > 0 && subtotal < minOrder) {
    return fail(`الحد الأدنى للطلب هو ${minOrder} جنيه`);
  }

  return {
    isValid: true,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    verifiedItems,
  };
}
