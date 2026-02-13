import React from 'react';
import { validateEgyptianPhone } from '../../../lib/phoneUtils';

interface PhoneInputProps {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    required?: boolean;
    className?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, error, required, className }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
        onChange(raw);
    };

    const showError = value.length > 0 && value.length >= 3 && !validateEgyptianPhone(value).valid;

    return (
        <div className="space-y-1">
            <div className={`flex items-center bg-white border rounded-xl overflow-hidden transition-all ${error || showError
                ? 'border-red-300 ring-2 ring-red-100'
                : 'border-slate-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary'
                } ${className || ''}`} dir="ltr">
                <span className="px-3 py-3.5 bg-slate-50 border-l border-slate-200 text-slate-500 font-bold text-sm select-none shrink-0">
                    +20
                </span>
                <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="10 1234 5678"
                    required={required}
                    value={value}
                    onChange={handleChange}
                    maxLength={10}
                    className="flex-1 px-3 py-3.5 outline-none font-medium placeholder:text-slate-300 text-slate-900 bg-transparent"
                />
            </div>
            {(error || showError) && (
                <p className="text-xs text-red-500 font-medium" dir="rtl">
                    {error || validateEgyptianPhone(value).error}
                </p>
            )}
        </div>
    );
};
