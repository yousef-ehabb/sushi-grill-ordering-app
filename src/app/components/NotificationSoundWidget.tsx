import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, ChevronUp, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { TONE_OPTIONS, type ToneId } from '../hooks/useOrderNotifications';

interface Props {
  isMuted: boolean;
  selectedTone: ToneId;
  onToggleMute: () => void;
  onSelectTone: (toneId: ToneId) => void;
  onPlayTone: (toneId: ToneId) => void;
}

export const NotificationSoundWidget: React.FC<Props> = ({
  isMuted,
  selectedTone,
  onToggleMute,
  onSelectTone,
  onPlayTone,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const currentTone = TONE_OPTIONS.find(t => t.id === selectedTone) || TONE_OPTIONS[0];

  return (
    <div ref={panelRef} className="fixed bottom-6 left-6 z-50" dir="rtl">
      {/* ── Popover Panel ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute bottom-full left-0 mb-3 w-[300px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  🔔 إعدادات صوت الإشعارات
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                >
                  <ChevronUp className="w-4 h-4 rotate-180" />
                </button>
              </div>
            </div>

            {/* Mute Toggle */}
            <div className="px-4 py-3 border-b border-slate-100">
              <button
                onClick={onToggleMute}
                className="w-full flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className={clsx(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                    isMuted
                      ? "bg-red-50 text-red-500"
                      : "bg-emerald-50 text-emerald-600"
                  )}>
                    {isMuted ? (
                      <VolumeX className="w-4.5 h-4.5" />
                    ) : (
                      <Volume2 className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-800 block leading-tight">
                      {isMuted ? 'الصوت مكتوم' : 'الصوت مفعّل'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {isMuted ? 'اضغط لتفعيل الصوت' : 'اضغط لكتم الصوت'}
                    </span>
                  </div>
                </div>
                {/* Toggle Switch Visual */}
                <div className={clsx(
                  "w-11 h-6 rounded-full p-0.5 transition-all flex items-center",
                  isMuted ? "bg-slate-200" : "bg-emerald-500"
                )}>
                  <div className={clsx(
                    "w-5 h-5 rounded-full bg-white shadow-sm transition-all",
                    isMuted ? "translate-x-0" : "-translate-x-5"
                  )} />
                </div>
              </button>
            </div>

            {/* Tone Selection */}
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1 mb-2">
                اختر نغمة التنبيه
              </p>
              <div className="space-y-1">
                {TONE_OPTIONS.map((tone) => {
                  const isSelected = selectedTone === tone.id;
                  return (
                    <button
                      key={tone.id}
                      onClick={() => {
                        if (isSelected) {
                          // Re-click to preview again
                          onPlayTone(tone.id);
                        } else {
                          onSelectTone(tone.id);
                        }
                      }}
                      className={clsx(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-right group/tone",
                        isSelected
                          ? "bg-emerald-50 border border-emerald-200"
                          : "hover:bg-slate-50 border border-transparent"
                      )}
                    >
                      {/* Icon */}
                      <span className="text-lg shrink-0 w-7 text-center">{tone.icon}</span>

                      {/* Label + Description */}
                      <div className="flex-1 min-w-0">
                        <span className={clsx(
                          "text-sm font-bold block leading-tight truncate",
                          isSelected ? "text-emerald-800" : "text-slate-700"
                        )}>
                          {tone.label}
                        </span>
                        <span className={clsx(
                          "text-[11px] block truncate",
                          isSelected ? "text-emerald-500" : "text-slate-400"
                        )}>
                          {tone.description}
                        </span>
                      </div>

                      {/* Check / Preview */}
                      <div className="shrink-0 w-7 flex items-center justify-center">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs opacity-0 group-hover/tone:opacity-100 transition-opacity">
                            ▶
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 text-center">
                اضغط على أي نغمة للاستماع واختيارها
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Trigger Button ── */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={clsx(
          "flex items-center gap-2.5 px-4 py-3 rounded-2xl border transition-all shadow-lg hover:shadow-xl active:scale-95",
          "bg-white",
          isMuted
            ? "border-red-200 hover:border-red-300"
            : "border-emerald-200 hover:border-emerald-300",
          isOpen && "ring-2 ring-offset-1",
          isOpen && (isMuted ? "ring-red-200" : "ring-emerald-200")
        )}
        aria-label="إعدادات صوت الإشعارات"
      >
        {/* Icon */}
        <div className={clsx(
          "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
          isMuted
            ? "bg-red-50 text-red-500"
            : "bg-emerald-50 text-emerald-600"
        )}>
          {isMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </div>

        {/* Label */}
        <div className="text-right hidden sm:block">
          <span className={clsx(
            "text-xs font-bold block leading-tight",
            isMuted ? "text-red-600" : "text-emerald-700"
          )}>
            {isMuted ? 'الصوت مكتوم' : 'الصوت مفعّل'}
          </span>
          <span className="text-[10px] text-slate-400 block leading-tight truncate max-w-[100px]">
            {isMuted ? 'كتم الإشعارات' : currentTone.label}
          </span>
        </div>

        {/* Expand indicator */}
        <ChevronUp className={clsx(
          "w-3.5 h-3.5 text-slate-300 transition-transform hidden sm:block",
          isOpen ? "rotate-0" : "rotate-180"
        )} />
      </button>
    </div>
  );
};
