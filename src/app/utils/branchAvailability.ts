import type { Product, ProductOption, GlobalSettings } from '../store/useStore';
import { isInOffHours, getOffHoursMessage } from './operatingHours';

export const BRANCH_NAMES = ['فرع الاستاد', 'فرع الكرفان'] as const;
export type BranchName = typeof BRANCH_NAMES[number];

/**
 * Check if a product is available in a specific branch.
 * Returns false if globally unavailable (is_available === false)
 * or explicitly unavailable in that specific branch.
 */
export function isProductAvailableInBranch(product: Product, branch: string): boolean {
  if (!product) return false;
  if (product.is_available === false || (product as any).available === false) {
    return false;
  }
  const branchMap = product.branch_availability || (product as any).branchAvailability;
  if (branchMap && branchMap[branch] === false) {
    return false;
  }
  return true;
}

/**
 * Check if a product option (e.g., sauce or upgrade) is available in a specific branch.
 * Returns false if globally unavailable (is_active === false or available === false)
 * or explicitly unavailable in the specified branch.
 */
export function isOptionAvailableInBranch(option: ProductOption, branch?: string | null): boolean {
  if (!option) return false;
  if (option.is_active === false || (option as any).available === false) {
    return false;
  }
  if (!branch) {
    return true;
  }
  const branchMap = option.branch_availability || (option as any).branchAvailability;
  if (branchMap && branchMap[branch] === false) {
    return false;
  }
  return true;
}

/**
 * Check if the auto-close feature (2:00 AM) is enabled for a branch.
 * Defaults to true for backwards compatibility and restaurant safety.
 */
export function isBranchAutoCloseEnabled(
  globalSettings: GlobalSettings | null | undefined,
  branch?: string | null
): boolean {
  if (!globalSettings) return true;
  if (!branch) {
    // If no specific branch, returns true if at least one branch has auto-close enabled
    const branches = Object.values(globalSettings.branches || {});
    if (branches.length === 0) return true;
    return branches.some((b) => b?.auto_close_enabled ?? true);
  }
  return globalSettings.branches?.[branch]?.auto_close_enabled ?? true;
}

/**
 * Check if a specific branch is currently open.
 *
 * Enforces the "Auto-Close / Manual-Open" rule:
 *  1. If auto-close is enabled for the branch and current time is off-hours (2:00 AM – 12:00 PM) → closed.
 *     If auto-close is disabled, the off-hours restriction is bypassed and branch follows manual is_open state.
 *  2. If website is globally closed → closed.
 *  3. If branch `is_open` flag is false → closed (requires manual open by admin).
 */
export function isBranchOpen(
  globalSettings: GlobalSettings | null | undefined,
  branch?: string | null
): boolean {
  // 1. Off-hours gate (only enforced if auto-close is enabled for this branch)
  const autoCloseActive = isBranchAutoCloseEnabled(globalSettings, branch);
  if (autoCloseActive && isInOffHours()) {
    return false;
  }

  if (!globalSettings) {
    return false; // default to closed if no settings loaded yet
  }

  // 2. Global website closed
  if (globalSettings.is_website_open === false) {
    return false;
  }

  if (!branch) {
    return true;
  }

  // 3. Branch-level is_open flag (requires explicit manual open)
  const branchStatus = globalSettings.branches?.[branch];
  if (!branchStatus || branchStatus.is_open === false) {
    return false;
  }

  return true;
}

/**
 * Get branch closure message.
 * Returns the most appropriate message based on closure reason priority:
 *  1. Off-hours window (if auto-close enabled) → off-hours message
 *  2. Global website closed → global closed message
 *  3. Branch specifically closed → branch closed message
 */
export function getBranchClosedMessage(
  globalSettings: GlobalSettings | null | undefined,
  branch?: string | null
): string {
  const autoCloseActive = isBranchAutoCloseEnabled(globalSettings, branch);

  // 1. Off-hours closure (only if auto-close is active for this branch)
  if (autoCloseActive && isInOffHours()) {
    return getOffHoursMessage();
  }

  if (!globalSettings) {
    return '';
  }

  // 2. Global website closed
  if (globalSettings.is_website_open === false) {
    return globalSettings.closed_message || 'المطعم مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.';
  }

  if (!branch) {
    return '';
  }

  // 3. Branch manually closed (not opened yet for the day)
  const branchStatus = globalSettings.branches?.[branch];
  if (!branchStatus || branchStatus.is_open === false) {
    return branchStatus?.closed_message || `${branch} مغلق حالياً — في انتظار فتح الفرع من الإدارة. نسعد باستقبالكم قريباً.`;
  }

  return '';
}

