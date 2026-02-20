import React, { useCallback } from 'react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import type { OptionGroup, ProductOption } from '../store/useStore';

interface OptionGroupSelectorProps {
  groups: OptionGroup[];
  selectedOptions: string[];
  setSelectedOptions: React.Dispatch<React.SetStateAction<string[]>>;
  variant?: 'sheet' | 'modal';
}

export const OptionGroupSelector: React.FC<OptionGroupSelectorProps> = ({
  groups,
  selectedOptions,
  setSelectedOptions,
  variant = 'sheet',
}) => {
  const handleOptionClick = useCallback((option: ProductOption, group: OptionGroup) => {
    if (!option.is_active) return;

    setSelectedOptions((prev) => {
      const isSelected = prev.includes(option.id);
      if (isSelected) {
        return prev.filter((id) => id !== option.id);
      }

      const groupSelections = prev.filter((id) => group.options?.some((o) => o.id === id));
      if (groupSelections.length >= group.max_select) {
        toast.warning(`يمكنك اختيار ${group.max_select} بحد أقصى`);
        return prev;
      }

      return [...prev, option.id];
    });
  }, [setSelectedOptions]);

  const getGroupSelectionCount = useCallback((group: OptionGroup) => {
    return selectedOptions.filter((id) => group.options?.some((o) => o.id === id)).length;
  }, [selectedOptions]);

  return (
    <>
      {groups.map((group) => {
        const count = getGroupSelectionCount(group);
        return (
          <div key={group.id} className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-700">{group.name_ar}</h4>
                {group.min_select > 0 && (
                  <span className="text-[10px] bg-red-50 text-primary px-2 py-0.5 rounded-full font-bold">إلزامي</span>
                )}
              </div>
              {variant === 'sheet' ? (
                <span className={clsx(
                  'text-xs font-bold px-2.5 py-1 rounded-full transition-colors',
                  count > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'
                )}>
                  {count}/{group.max_select}
                </span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                  (حد أقصى {group.max_select})
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {group.options
                ?.slice()
                .sort((a, b) => Number(b.is_active) - Number(a.is_active))
                .map((option) => {
                  const isSelected = selectedOptions.includes(option.id);
                  const isInactive = !option.is_active;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isInactive}
                      onClick={() => handleOptionClick(option, group)}
                      className={clsx(
                        variant === 'sheet'
                          ? 'px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2'
                          : 'px-4 py-2 rounded-xl text-sm font-medium transition-all border text-right flex items-center gap-2',
                        isInactive
                          ? (variant === 'sheet'
                            ? 'opacity-50 border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed pointer-events-none'
                            : 'opacity-40 cursor-not-allowed border-transparent grayscale pointer-events-none')
                          : isSelected
                            ? (variant === 'sheet'
                              ? 'border-primary bg-red-50 text-primary shadow-sm shadow-red-500/10 scale-[1.02]'
                              : 'bg-primary text-white border-primary shadow-md shadow-red-500/10')
                            : (variant === 'sheet'
                              ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 active:scale-95'
                              : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-200 active:scale-95')
                      )}
                    >
                      <span>{option.name_ar}</span>
                      {option.price_delta > 0 && (
                        <span className={clsx(
                          variant === 'sheet' ? 'text-[10px] mr-1' : 'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                          variant === 'sheet'
                            ? (isSelected ? 'text-primary/60' : 'text-slate-400')
                            : (isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500')
                        )}>
                          +{option.price_delta}
                          {variant === 'sheet' ? ' ج.م' : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        );
      })}
    </>
  );
};
