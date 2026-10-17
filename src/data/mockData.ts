import { Category, Product, OptionGroup, GlobalSettings, BusinessRule } from '../app/store/useStore';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-beef-mix',
    name_ar: 'برجر لحم وميكس',
    name_en: 'Beef & Mix Burgers',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'cat-chicken',
    name_ar: 'برجر فراخ',
    name_en: 'Chicken Burgers',
    sort_order: 2,
    is_active: true,
  },
];

export const INITIAL_PRODUCTS: Product[] = [
  // 1. AKM
  {
    id: 'prod-akm',
    category_id: 'cat-beef-mix',
    name_ar: 'AKM',
    name_en: 'AKM Beef Burger',
    description_ar: 'قطعة لحمة بلدي - خس - طماطم - خيار مخلل - روز بيف - صوص التكساس - صوص كاتشب + بطاطس',
    price: 120,
    image_url: '/AKM.jpg',
    is_available: true,
    is_best_seller: false,
    ingredients_ar: ['لحمة بلدي', 'خس', 'طماطم', 'خيار مخلل', 'روز بيف', 'صوص تكساس', 'صوص كاتشب', 'بطاطس'],
  },
  // 2. UMP
  {
    id: 'prod-ump',
    category_id: 'cat-beef-mix',
    name_ar: 'UMP',
    name_en: 'UMP Beef & Fried Cheese',
    description_ar: 'قطعة لحمة بلدي - شريحة جبنة مقلية - خس - طماطم - خيار مخلل - روز بيف - صوص التكساس - صوص الكاتشب + بطاطس',
    price: 140,
    image_url: '/UMP.jpg',
    is_available: true,
    is_best_seller: false,
    ingredients_ar: ['لحمة بلدي', 'جبنة مقلية', 'خس', 'طماطم', 'خيار مخلل', 'روز بيف', 'صوص تكساس', 'صوص كاتشب', 'بطاطس'],
  },
  // 3. M4
  {
    id: 'prod-m4',
    category_id: 'cat-beef-mix',
    name_ar: 'M4',
    name_en: 'M4 Double Beef Burger',
    description_ar: '2 قطعة لحمة بلدي - خس - طماطم - خيار مخلل - روز بيف - صوص التكساس - صوص الكاتشب + بطاطس',
    price: 165,
    image_url: '/M4.jpg',
    is_available: true,
    is_best_seller: false,
    ingredients_ar: ['2 قطعة لحمة بلدي', 'خس', 'طماطم', 'خيار مخلل', 'روز بيف', 'صوص تكساس', 'صوص كاتشب', 'بطاطس'],
  },
  // 4. Pochinki
  {
    id: 'prod-pochinki',
    category_id: 'cat-beef-mix',
    name_ar: 'Pochinki',
    name_en: 'Pochinki Special Mix',
    description_ar: 'قطعة لحمة بلدي - قطعتين فرايد تشيكن - خس - طماطم - خيار مخلل - صوص تكساس - صوص رانش - روز بيف + بطاطس',
    price: 180,
    image_url: '/Pochinki.jpg',
    is_available: true,
    is_best_seller: true,
    badge: 'الأكثر طلباً',
    ingredients_ar: ['لحمة بلدي', 'قطعتين فرايد تشيكن', 'خس', 'طماطم', 'خيار مخلل', 'صوص تكساس', 'صوص رانش', 'روز بيف', 'بطاطس'],
  },
  // 5. AWM
  {
    id: 'prod-awm',
    category_id: 'cat-chicken',
    name_ar: 'AWM',
    name_en: 'AWM Crispy Chicken',
    description_ar: 'قطعتين فرايد تشيكن - خس - طماطم - خيار مخلل - تركي مدخن - صوص كاتشب - صوص الرانش + بطاطس',
    price: 120,
    image_url: '/AWM.jpg',
    is_available: true,
    is_best_seller: false,
    ingredients_ar: ['قطعتين فرايد تشيكن', 'خس', 'طماطم', 'خيار مخلل', 'تركي مدخن', 'صوص كاتشب', 'صوص رانش', 'بطاطس'],
  },
  // 6. KAR
  {
    id: 'prod-kar',
    category_id: 'cat-chicken',
    name_ar: 'KAR',
    name_en: 'KAR Giant Chicken (4 Pieces)',
    description_ar: 'أربع قطع فرايد تشيكن - خس - طماطم - خيار مخلل - تركي مدخن - صوص كاتشب - صوص رانش + بطاطس',
    price: 170,
    image_url: '/KAR.jpg',
    is_available: true,
    is_best_seller: false,
    ingredients_ar: ['4 قطع فرايد تشيكن', 'خس', 'طماطم', 'خيار مخلل', 'تركي مدخن', 'صوص كاتشب', 'صوص رانش', 'بطاطس'],
  },
  // 7. SCAR-L
  {
    id: 'prod-scar-l',
    category_id: 'cat-chicken',
    name_ar: 'SCAR-L',
    name_en: 'SCAR-L Coleslaw Chicken',
    description_ar: 'قطعة برجر فراخ - كول سلو - صوص رانش + بطاطس',
    price: 130,
    image_url: '/SCAR-L.jpg',
    is_available: true,
    is_best_seller: false,
    badge: 'جديد',
    ingredients_ar: ['قطعة برجر فراخ', 'كول سلو طازج', 'صوص رانش', 'بطاطس مقلية'],
  },
];

/**
 * Generate standard Pochinki Option Groups for any sandwich product ID
 */
export const createOptionGroupsForProduct = (productId: string): OptionGroup[] => {
  return [
    {
      id: 'group-upgrade',
      product_id: 'all',
      key: 'upgrade',
      name_ar: 'ترقية الساندوتش',
      min_select: 0,
      max_select: 1,
      is_active: true,
      sort_order: 1,
      options: [
        {
          id: 'opt-extra-fries-sauce',
          group_id: 'group-upgrade',
          name_ar: 'إكسترا بطاطس + صوص',
          price_delta: 30,
          is_active: true,
          sort_order: 1,
        },
      ],
    },
    {
      id: 'group-sauces',
      product_id: 'all',
      key: 'sauces',
      name_ar: 'إضافات الصوصات',
      min_select: 0,
      max_select: 4,
      is_active: true,
      sort_order: 2,
      options: [
        {
          id: 'opt-spicy-sauce',
          group_id: 'group-sauces',
          name_ar: 'صوص حار',
          price_delta: 10,
          is_active: true,
          sort_order: 1,
        },
        {
          id: 'opt-ranch-sauce',
          group_id: 'group-sauces',
          name_ar: 'صوص رانش',
          price_delta: 10,
          is_active: true,
          sort_order: 2,
        },
        {
          id: 'opt-texas-sauce',
          group_id: 'group-sauces',
          name_ar: 'صوص تكساس',
          price_delta: 20,
          is_active: true,
          sort_order: 3,
        },
        {
          id: 'opt-cheddar-sauce',
          group_id: 'group-sauces',
          name_ar: 'صوص شيدر',
          price_delta: 20,
          is_active: true,
          sort_order: 4,
        },
      ],
    },
  ];
};

export const INITIAL_OPTION_GROUPS_BY_PRODUCT: Record<string, OptionGroup[]> = INITIAL_PRODUCTS.reduce(
  (acc, product) => {
    acc[product.id] = createOptionGroupsForProduct(product.id);
    return acc;
  },
  {} as Record<string, OptionGroup[]>
);

export const INITIAL_GLOBAL_SETTINGS: GlobalSettings = {
  id: 'settings-1',
  is_website_open: true,
  closed_message: 'المطعم مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.',
  branches: {
    'فرع الاستاد': {
      is_open: false,
      closed_message: 'فرع الاستاد مغلق حالياً — في انتظار فتح الفرع من الإدارة. نسعد باستقبالكم قريباً.',
      auto_close_enabled: true,
    },
    'فرع الكرفان': {
      is_open: false,
      closed_message: 'فرع الكرفان مغلق حالياً — في انتظار فتح الفرع من الإدارة. نسعد باستقبالكم قريباً.',
      auto_close_enabled: true,
    },
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const INITIAL_BUSINESS_RULES: BusinessRule[] = [];
