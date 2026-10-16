import type { Product, ProductOption, GlobalSettings } from '../store/useStore';

export const BRANCH_NAMES = ['فرع الاستاد', 'فرع الكرفان'] as const;
export type BranchName = typeof BRANCH_NAMES[number];

/**
 * Check if a product is available in a specific branch.
 * Returns false if globally unavailable (is_available === false)
 * or explicitly unavailable in that specific branch.
 */
export function isProductAvailableInBranch(product: Product, branch: string): boolean {
  if (!product) return false;
  if (product.is_available === false) {
    return false;
  }
  if (product.branch_availability && product.branch_availability[branch] === false) {
    return false;
  }
  return true;
}

/**
 * Check if a product option (e.g., sauce or upgrade) is available in a specific branch.
 */
export function isOptionAvailableInBranch(option: ProductOption, branch: string): boolean {
  if (!option) return false;
  if (option.is_active === false) {
    return false;
  }
  if (option.branch_availability && option.branch_availability[branch] === false) {
    return false;
  }
  return true;
}

/**
 * Check if a specific branch is currently open.
 * Returns false if website is globally closed or if the branch itself is closed.
 */
export function isBranchOpen(
  globalSettings: GlobalSettings | null | undefined,
  branch: string
): { isOpen: boolean; closedMessage: string } {
  if (!globalSettings) {
    return { isOpen: true, closedMessage: '' };
  }
  if (globalSettings.is_website_open === false) {
    return {
      isOpen: false,
      closedMessage: globalSettings.closed_message || 'المطعم مغلق حالياً ولا يستقبل طلبات جديدة.',
    };
  }
  const branchStatus = globalSettings.branches?.[branch];
  if (branchStatus && branchStatus.is_open === false) {
    return {
      isOpen: false,
      closedMessage: branchStatus.closed_message || `${branch} مغلق حالياً ولا يستقبل طلبات جديدة.`,
    };
  }
  return { isOpen: true, closedMessage: '' };
}
