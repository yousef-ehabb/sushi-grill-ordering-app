import type { Order } from '../store/useStore';
import { getDisplayOrderId } from './orderUtils';

/**
 * Predefined dictionary of known option names & categories
 * to ensure instant accurate Arabic translation even before Firestore resolves.
 */
const KNOWN_OPTIONS: Record<string, { name: string; type: 'upgrade' | 'sauce' }> = {
  'opt-extra-fries-sauce': { name: 'إكسترا بطاطس + صوص', type: 'upgrade' },
  'opt-spicy-sauce': { name: 'صوص حار', type: 'sauce' },
  'opt-ranch-sauce': { name: 'صوص رانش', type: 'sauce' },
  'opt-texas-sauce': { name: 'صوص تكساس', type: 'sauce' },
  'opt-cheddar-sauce': { name: 'صوص شيدر', type: 'sauce' },
};

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function categorizeOptions(
  optionIds: string[] | undefined,
  optionsMap?: Map<string, string>
): { upgrades: string[]; sauces: string[]; others: string[] } {
  const upgrades: string[] = [];
  const sauces: string[] = [];
  const others: string[] = [];

  if (!optionIds || optionIds.length === 0) {
    return { upgrades, sauces, others };
  }

  for (const optId of optionIds) {
    const known = KNOWN_OPTIONS[optId];
    const name = optionsMap?.get(optId) || known?.name || optId;

    if (known?.type === 'upgrade' || name.includes('ترقية') || name.includes('بطاطس')) {
      upgrades.push(name);
    } else if (known?.type === 'sauce' || name.includes('صوص')) {
      sauces.push(name);
    } else {
      others.push(name);
    }
  }

  return { upgrades, sauces, others };
}

/**
 * Generates high-contrast, clean 80mm POS Thermal Receipt HTML formatted for kitchen and cashier
 */
export function generateReceiptHtml(order: Order, optionsMap?: Map<string, string>): string {
  const displayId = getDisplayOrderId(order);
  const dateObj = new Date(order.created_at);
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '';
  const formattedTime = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : '';

  const orderTypeArabic = order.type === 'delivery' ? 'توصيل للمنزل' : 'استلام من المطعم';
  const branchName = order.branch || 'فرع المطعم';
  const totalItemsCount = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  const itemsHtml = (order.items || []).map((item, index) => {
    const { upgrades, sauces, others } = categorizeOptions(item.selected_option_ids, optionsMap);
    const itemTotal = (item.unit_price || 0) * (item.quantity || 1);

    const upgradeHtml = upgrades.length > 0
      ? `<div class="sub-item upgrade-item"><span class="bullet">+</span> <strong>ترقية:</strong> ${escapeHtml(upgrades.join('، '))}</div>`
      : '';

    const sauceHtml = sauces.length > 0
      ? `<div class="sub-item sauce-item"><span class="bullet">+</span> <strong>صوصات:</strong> ${escapeHtml(sauces.join('، '))}</div>`
      : '';

    const otherHtml = others.length > 0
      ? `<div class="sub-item other-item"><span class="bullet">+</span> <strong>إضافات:</strong> ${escapeHtml(others.join('، '))}</div>`
      : '';

    const noteHtml = item.special_instructions
      ? `<div class="sub-item note-item"><span class="bullet">★</span> <strong>ملاحظة:</strong> ${escapeHtml(item.special_instructions)}</div>`
      : '';

    const isLast = index === (order.items?.length || 0) - 1;

    return `
      <div class="item-block ${!isLast ? 'item-border' : ''}">
        <div class="item-header">
          <div class="item-title">
            <span class="qty">${item.quantity || 1}×</span>
            <span class="name">${escapeHtml(item.name_ar)}</span>
          </div>
          <div class="price">${itemTotal} ج.م</div>
        </div>
        ${upgradeHtml}
        ${sauceHtml}
        ${otherHtml}
        ${noteHtml}
      </div>
    `;
  }).join('');

  const deliveryFee = order.delivery_fee && order.delivery_fee > 0 ? order.delivery_fee : 0;
  const subtotal = order.subtotal || (order.total - deliveryFee);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>وصل طلب ${escapeHtml(displayId)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    @media print {
      html, body {
        width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
      }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 76mm;
      margin: 0 auto;
      padding: 10px 4px 18px 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      direction: rtl;
      text-align: right;
      color: #000;
      background: #fff;
      font-size: 13px;
      line-height: 1.35;
    }

    /* Header */
    .brand-title {
      text-align: center;
      font-size: 19px;
      font-weight: 900;
      letter-spacing: -0.3px;
      margin: 0;
      padding-bottom: 4px;
    }
    .brand-subtitle {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin: 0 0 6px 0;
    }
    .branch-container {
      text-align: center;
      margin-bottom: 6px;
    }
    .branch-badge {
      display: inline-block;
      border: 1.5px solid #000;
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 800;
    }

    /* Huge Order Number Box */
    .order-box {
      border: 2.5px solid #000;
      border-radius: 8px;
      padding: 8px 4px;
      text-align: center;
      margin: 8px 0;
      background: #fafafa;
    }
    .order-label {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 2px;
    }
    .order-number {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    /* Meta Info */
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      font-weight: 700;
      margin: 2px 0;
    }

    /* Divider */
    .dashed-divider {
      border-top: 1.5px dashed #000;
      margin: 8px 0;
    }
    .double-divider {
      border-top: 2.5px solid #000;
      margin: 10px 0 6px 0;
    }

    /* Customer Info */
    .section-title {
      font-size: 12px;
      font-weight: 900;
      margin-bottom: 4px;
    }
    .info-line {
      font-size: 12px;
      margin: 3px 0;
      line-height: 1.3;
    }
    .info-line strong {
      font-weight: 800;
    }

    /* Items Section */
    .items-container {
      margin: 8px 0;
    }
    .item-block {
      padding: 6px 0;
    }
    .item-border {
      border-bottom: 1px dotted #555;
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 14.5px;
      font-weight: 900;
      gap: 6px;
    }
    .item-title {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
    }
    .qty {
      font-size: 16px;
      font-weight: 900;
    }
    .name {
      font-size: 14.5px;
      font-weight: 900;
    }
    .price {
      font-size: 13.5px;
      font-weight: 800;
      white-space: nowrap;
    }

    /* Customization sub-items */
    .sub-item {
      font-size: 11.5px;
      margin: 2px 14px 2px 0;
      line-height: 1.25;
    }
    .bullet {
      font-weight: 900;
      margin-left: 3px;
    }
    .upgrade-item {
      font-weight: 700;
    }
    .sauce-item {
      font-weight: 700;
    }
    .note-item {
      background: #eeeeee;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 800;
      display: inline-block;
      margin-top: 4px;
    }

    /* Totals */
    .totals-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
      margin: 3px 0;
    }
    .grand-total-box {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 6px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      background: #fafafa;
    }
    .grand-total-label {
      font-size: 15px;
      font-weight: 900;
    }
    .grand-total-val {
      font-size: 19px;
      font-weight: 900;
    }

    /* Footer Note */
    .footer-note {
      text-align: center;
      font-size: 12px;
      font-weight: 800;
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px dashed #777;
    }
  </style>
</head>
<body>

  <!-- Brand Header -->
  <div class="brand-title">POCHINKI BURGER</div>
  <div class="brand-subtitle">بوشنكي برجر</div>

  <!-- Branch Badge -->
  <div class="branch-container">
    <span class="branch-badge">${escapeHtml(branchName)}</span>
  </div>

  <!-- Huge Order Box -->
  <div class="order-box">
    <div class="order-label">طلب رقم</div>
    <div class="order-number">${escapeHtml(displayId)}</div>
  </div>

  <!-- Meta Info -->
  <div class="meta-row">
    <span>${formattedDate} - ${formattedTime}</span>
    <span>الدفع: كاش</span>
  </div>
  <div class="meta-row">
    <span>النوع: <strong>${orderTypeArabic}</strong></span>
    <span>إجمالي الأصناف: <strong>${totalItemsCount}</strong></span>
  </div>

  <!-- Customer Info -->
  <div class="dashed-divider"></div>
  <div class="section-title">بيانات العميل:</div>
  <div class="info-line">العميل: <strong>${escapeHtml(order.customer_name || 'بدون اسم')}</strong></div>
  <div class="info-line">الهاتف: <strong dir="ltr">${escapeHtml(order.customer_phone || '-')}</strong></div>
  ${order.type === 'delivery' && order.address ? `<div class="info-line">العنوان: <strong>${escapeHtml(order.address)}</strong></div>` : ''}

  <!-- Items Table -->
  <div class="dashed-divider"></div>
  <div class="section-title">تفاصيل الطلب (المطبخ):</div>
  <div class="items-container">
    ${itemsHtml}
  </div>

  <!-- Totals -->
  <div class="dashed-divider"></div>
  ${deliveryFee > 0 ? `
    <div class="totals-row">
      <span>قيمة الأصناف:</span>
      <span>${subtotal} ج.م</span>
    </div>
    <div class="totals-row">
      <span>خدمة التوصيل:</span>
      <span>${deliveryFee} ج.م</span>
    </div>
  ` : ''}

  <div class="grand-total-box">
    <span class="grand-total-label">المجموع المطلوب:</span>
    <span class="grand-total-val">${order.total} ج.م</span>
  </div>

  <!-- Footer Note -->
  <div class="footer-note">
    شكراً لطلبكم من بوشنكي برجر ❤️
  </div>

</body>
</html>`;
}

/**
 * Triggers non-blocking POS thermal receipt printing using an invisible iframe.
 */
export function printOrderReceipt(order: Order, optionsMap?: Map<string, string>): void {
  try {
    let iframe = document.getElementById('pos-receipt-print-frame') as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'pos-receipt-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      console.error('[ReceiptPrinter] Could not access print iframe document');
      return;
    }

    const htmlContent = generateReceiptHtml(order, optionsMap);

    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Allow browser 250ms to render layout before opening print dialog
    setTimeout(() => {
      try {
        const iframeWin = iframe?.contentWindow;
        if (iframeWin) {
          iframeWin.focus();
          iframeWin.print();
        }
      } catch (err) {
        console.error('[ReceiptPrinter] Error executing print:', err);
      }
    }, 250);
  } catch (error) {
    console.error('[ReceiptPrinter] Error setting up receipt print:', error);
  }
}
