import React, { useCallback } from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
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
  variant = 'modal',
}) => {
  const handleOptionClick = useCallback((option: ProductOption, group: OptionGroup) => {
    if (!option.is_active) return;

    setSelectedOptions((prev) => {
      const isSelected = prev.includes(option.id);
      if (isSelected) {
        return prev.filter((id) => id !== option.id);
      }

      const groupSelections = prev.filter((id) => group.options?.some((o) => o.id === id));
      if (group.max_select === 1) {
        // If single choice, replace selection in this group
        const withoutGroup = prev.filter((id) => !group.options?.some((o) => o.id === id));
        return [...withoutGroup, option.id];
      }

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
    <div className="space-y-5">
      {groups.map((group) => {
        const count = getGroupSelectionCount(group);
        const isSingleChoice = group.max_select === 1;
        const optionsList = group.options
          ?.slice()
          .sort((a, b) => Number(b.is_active) - Number(a.is_active)) || [];

        return (
          <div key={group.id} className="space-y-2.5">
            {/* Group Header */}
            <div className="flex justify-between items-center px-0.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-zinc-900 tracking-tight">{group.name_ar}</h4>
                {group.min_select > 0 ? (
                  <span className="text-[10px] bg-red-50 text-[#DC2626] border border-red-100 px-2 py-0.5 rounded-full font-bold">
                    إلزامي
                  </span>
                ) : (
                  <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">
                    اختياري
                  </span>
                )}
              </div>
              <span className={clsx(
                'text-xs font-bold px-2.5 py-0.5 rounded-full transition-colors',
                count > 0 ? 'bg-red-50 text-[#DC2626] border border-red-100' : 'bg-zinc-100 text-zinc-500'
              )}>
                {count > 0
                  ? `تم تحديد ${count}/${group.max_select}`
                  : isSingleChoice
                    ? 'اختر 1'
                    : `حد أقصى ${group.max_select}`}
              </span>
            </div>

            {/* Options Cards Grid */}
            <div className={clsx(
              'grid gap-2.5',
              optionsList.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
            )}>
              {optionsList.map((option) => {
                const isSelected = selectedOptions.includes(option.id);
                const isInactive = !option.is_active;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isInactive}
                    onClick={() => handleOptionClick(option, group)}
                    className={clsx(
                      'group/card relative p-3.5 sm:p-4 rounded-2xl border text-right transition-all flex items-center justify-between gap-3 text-sm cursor-pointer select-none min-h-[54px]',
                      isInactive
                        ? 'opacity-40 bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed pointer-events-none'
                        : isSelected
                          ? 'border-[#DC2626] bg-red-50/70 text-zinc-950 shadow-xs ring-1 ring-[#DC2626]/20 font-bold'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60 text-zinc-700 active:scale-[0.99]'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Check / Radio indicator */}
                      <div
                        className={clsx(
                          'w-5 h-5 flex items-center justify-center shrink-0 border transition-all',
                          isSingleChoice ? 'rounded-full' : 'rounded-lg',
                          isSelected
                            ? 'bg-[#DC2626] border-[#DC2626] text-white shadow-xs'
                            : 'border-zinc-300 bg-white group-hover/card:border-zinc-400'
                        )}
                      >
                        {isSelected && (
                          isSingleChoice ? (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )
                        )}
                      </div>
                      <span className="truncate text-xs sm:text-sm font-bold text-zinc-800">
                        {option.name_ar}
                      </span>
                    </div>

                    {/* Distinct Price Badge */}
                    <div className="shrink-0">
                      {option.price_delta > 0 ? (
                        <span
                          className={clsx(
                            'text-xs font-black px-2.5 py-1 rounded-xl border transition-colors',
                            isSelected
                              ? 'bg-[#DC2626] text-white border-transparent shadow-xs'
                              : 'bg-red-50 text-[#DC2626] border-red-100'
                          )}
                        >
                          +{option.price_delta} ج.م
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-400 font-semibold px-2 py-0.5">
                          مجاناً
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

