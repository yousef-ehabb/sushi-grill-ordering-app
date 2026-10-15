/**
 * Centralized Restaurant Configuration
 * Single Source of Truth for Brand, Contact, Branches, Social Links, and Ordering Settings
 */

export interface RestaurantBranch {
  id: string;
  name_ar: string;
  name_en: string;
  phones: string[];
  is_main?: boolean;
}

export interface RestaurantConfig {
  brand: {
    nameAr: string;
    nameEn: string;
    taglineAr: string;
    taglineEn: string;
    heroTitle: string;
    heroSubtitle: string;
    heroImageUrl: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    accentColor: string;
  };
  contact: {
    primaryPhone: string;
    branches: RestaurantBranch[];
  };
  social: {
    instagram: string;
    instagramUrl: string;
    facebook: string;
    facebookUrl: string;
  };
  ordering: {
    currencySymbol: string;
    defaultDeliveryFee: number;
    minOrderAmount: number;
    estimatedDeliveryTime: string;
    allowDelivery: boolean;
    allowPickup: boolean;
    allowGuestCheckout: boolean;
    isOpen: boolean;
    closedMessage: string;
  };
}

export const restaurantConfig: RestaurantConfig = {
  brand: {
    nameAr: 'بوشنكي - ملوك البرجر',
    nameEn: 'Pochinki Burger',
    taglineAr: 'ملوك البرجر',
    taglineEn: 'Kings of Burger',
    heroTitle: 'طعم البرجر البلدي على طريقة بوشنكي',
    heroSubtitle: 'ساندوتشات برجر اللحم البلدي الأصلي وقطع الفرايد تشيكن المقرمشة مع خلطات وتتبيلات بوشنكي الخاصة. اطلب الآن واستمتع بالمذاق الطازج.',
    heroImageUrl: '/730321018_1046208854429474_6904092824444174217_n.png',
    logoUrl: '/PochinkiLogo.png',
    faviconUrl: '/favicon.png',
    primaryColor: '#B91C1C', // Dark fire red
    accentColor: '#FACC15',  // Gold yellow
  },
  contact: {
    primaryPhone: '01111185254',
    branches: [
      {
        id: 'stadium',
        name_ar: 'فرع الاستاد (الرئيسي)',
        name_en: 'Stadium Branch',
        phones: ['01111185254'],
        is_main: true,
      },
      {
        id: 'caravan',
        name_ar: 'فرع الكرفان',
        name_en: 'Caravan Branch',
        phones: ['01155749595', '01146109985'],
      },
    ],
  },
  social: {
    instagram: 'pochi.nkiburger',
    instagramUrl: 'https://www.instagram.com/pochi.nkiburger',
    facebook: 'pochinki burger',
    facebookUrl: 'https://www.facebook.com/pochinki%20burger',
  },
  ordering: {
    currencySymbol: 'ج.م',
    defaultDeliveryFee: 25,
    minOrderAmount: 80,
    estimatedDeliveryTime: '30-45 دقيقة',
    allowDelivery: true,
    allowPickup: true,
    allowGuestCheckout: true,
    isOpen: true,
    closedMessage: 'المطعم مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.',
  },
};
