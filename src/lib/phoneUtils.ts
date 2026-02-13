const EGYPT_PREFIX = '+20';
const VALID_OPERATORS = ['10', '11', '12', '15'];

export function normalizePhone(input: string): string {
    const digits = input.replace(/\D/g, '');
    if (digits.startsWith('20')) return `+${digits}`;
    if (digits.startsWith('0')) return `${EGYPT_PREFIX}${digits.slice(1)}`;
    return `${EGYPT_PREFIX}${digits}`;
}

export function validateEgyptianPhone(input: string): { valid: boolean; error?: string } {
    const digits = input.replace(/\D/g, '');

    if (digits.length !== 10) {
        return { valid: false, error: 'رقم الهاتف يجب أن يكون 10 أرقام' };
    }

    if (!digits.startsWith('1')) {
        return { valid: false, error: 'رقم الهاتف يجب أن يبدأ بـ 1' };
    }

    const operator = digits.slice(0, 2);
    if (!VALID_OPERATORS.includes(operator)) {
        return { valid: false, error: 'رقم هاتف غير صالح (المشغل غير معروف)' };
    }

    return { valid: true };
}

export function formatPhoneDisplay(stored: string): string {
    const digits = stored.replace(/\D/g, '');
    const local = digits.startsWith('20') ? digits.slice(2) : digits;
    if (local.length === 10) {
        return `0${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
    }
    return stored;
}

export function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
