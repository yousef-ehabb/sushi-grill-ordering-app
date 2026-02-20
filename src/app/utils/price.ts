import type { OptionGroup } from '../store/useStore';

/**
 * Shared utility to compute the total price delta from selected options.
 * Takes the selectedOptions array and the groups array and returns the summed price delta.
 */
export const computeOptionsPrice = (selectedOptions: string[], groups: OptionGroup[]): number => {
  const allOptions = groups.flatMap((g) => g.options || []);
  return selectedOptions.reduce((total, optionId) => {
    const option = allOptions.find((o) => o.id === optionId);
    return total + (option?.price_delta || 0);
  }, 0);
};
