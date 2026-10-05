export const STORE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STORE_CODE_REGEX = /^[2-9A-HJ-NP-Z]{5}$/;

export function generateStoreCode() {
  const bytes = new Uint8Array(5);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 5; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += STORE_CODE_ALPHABET[bytes[i] % STORE_CODE_ALPHABET.length];
  }
  return code;
}

export function normalizeStoreCode(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input.trim().toUpperCase();
  return cleaned;
}

export function isValidStoreCode(input) {
  const code = normalizeStoreCode(input);
  return STORE_CODE_REGEX.test(code);
}

export const StoreOperationalStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  PAUSED_BY_MERCHANT: 'PAUSED_BY_MERCHANT',
  SUSPENDED_BY_ABH1: 'SUSPENDED_BY_ABH1',
});

export const MerchantRole = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
});

export const RequestType = Object.freeze({
  PRINT: 'PRINT',
  SERVICE: 'SERVICE',
  STATIONERY: 'STATIONERY',
  MIXED: 'MIXED',
});

export const ItemType = Object.freeze({
  PRINT: 'PRINT',
  SERVICE: 'SERVICE',
  PRODUCT: 'PRODUCT',
});

export const RequestState = Object.freeze({
  DRAFT: 'DRAFT',
  AWAITING_QUOTE: 'AWAITING_QUOTE',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  SUBMITTED: 'SUBMITTED',
  ACCEPTED: 'ACCEPTED',
  PROCESSING: 'PROCESSING',
  CUSTOMER_ACTION_REQUIRED: 'CUSTOMER_ACTION_REQUIRED',
  PRINTING: 'PRINTING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
});

export const ItemStatus = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PROCESSING: 'PROCESSING',
  PRINTING: 'PRINTING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

export const PaymentMethod = Object.freeze({
  PAY_AT_COUNTER: 'PAY_AT_COUNTER',
  UPI_QR: 'UPI_QR',
  RAZORPAY: 'RAZORPAY',
  DEVELOPMENT_ONLY: 'DEVELOPMENT_ONLY',
});

export const PaymentStatus = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

export const ServicePriceMode = Object.freeze({
  FREE: 'FREE',
  FIXED: 'FIXED',
  STARTING_AT: 'STARTING_AT',
  MERCHANT_QUOTE: 'MERCHANT_QUOTE',
  PAY_AT_COUNTER: 'PAY_AT_COUNTER',
});

const transitions = new Map([
  [RequestState.DRAFT, [RequestState.AWAITING_QUOTE, RequestState.AWAITING_PAYMENT, RequestState.SUBMITTED, RequestState.CANCELLED]],
  [RequestState.AWAITING_QUOTE, [RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.AWAITING_PAYMENT, RequestState.SUBMITTED, RequestState.CANCELLED, RequestState.REJECTED]],
  [RequestState.AWAITING_PAYMENT, [RequestState.PAID, RequestState.SUBMITTED, RequestState.CANCELLED, RequestState.FAILED]],
  [RequestState.PAID, [RequestState.SUBMITTED, RequestState.REFUND_PENDING]],
  [RequestState.SUBMITTED, [RequestState.ACCEPTED, RequestState.PROCESSING, RequestState.PRINTING, RequestState.REJECTED, RequestState.CANCELLED]],
  [RequestState.ACCEPTED, [RequestState.PROCESSING, RequestState.PRINTING, RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.READY, RequestState.REJECTED]],
  [RequestState.PROCESSING, [RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.PRINTING, RequestState.READY, RequestState.COMPLETED, RequestState.FAILED]],
  [RequestState.PRINTING, [RequestState.PROCESSING, RequestState.READY, RequestState.FAILED]],
  [RequestState.CUSTOMER_ACTION_REQUIRED, [RequestState.AWAITING_PAYMENT, RequestState.SUBMITTED, RequestState.PROCESSING, RequestState.CANCELLED, RequestState.REJECTED]],
  [RequestState.READY, [RequestState.COMPLETED, RequestState.CANCELLED]],
  [RequestState.FAILED, [RequestState.PROCESSING, RequestState.REFUND_PENDING]],
  [RequestState.REFUND_PENDING, [RequestState.REFUNDED]],
]);

export function canTransition(from, to) {
  return transitions.get(from)?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new Error(`Cannot transition from ${from} to ${to}`);
}

export function computeAggregateRequestState(items = [], currentState = RequestState.SUBMITTED) {
  if (!items.length) return currentState;
  const statuses = items.map((i) => i.status || ItemStatus.PENDING);

  if (statuses.every((s) => s === ItemStatus.COMPLETED)) return RequestState.COMPLETED;
  if (statuses.every((s) => s === ItemStatus.READY || s === ItemStatus.COMPLETED)) return RequestState.READY;
  if (statuses.every((s) => s === ItemStatus.REJECTED || s === ItemStatus.CANCELLED)) return RequestState.REJECTED;
  if (statuses.some((s) => s === ItemStatus.FAILED)) return RequestState.FAILED;
  if (statuses.some((s) => s === ItemStatus.PRINTING)) return RequestState.PRINTING;
  if (statuses.some((s) => s === ItemStatus.PROCESSING || s === ItemStatus.READY)) return RequestState.PROCESSING;
  if (statuses.some((s) => s === ItemStatus.ACCEPTED)) return RequestState.ACCEPTED;

  return currentState;
}

export function parsePageRange(value, totalPages) {
  const raw = String(value ?? 'all').trim().toLowerCase();
  if (raw === 'all') return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('A known page count is required for custom ranges');
  const pages = new Set();
  for (const segment of raw.split(',')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const [startText, endText] = trimmed.split('-');
    const start = Number(startText);
    const end = endText === undefined ? start : Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > totalPages) {
      throw new Error('Enter pages as 1, 3-5, or all');
    }
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  if (pages.size === 0) throw new Error('Choose at least one page');
  return [...pages].sort((a, b) => a - b);
}

export function calculatePrintPrice({ pages, copies, colorMode, paperSize, sides }, rates) {
  if (!Number.isInteger(pages) || pages < 1 || !Number.isInteger(copies) || copies < 1 || copies > 99) {
    throw new Error('Pages and copies must be positive whole numbers');
  }
  const key = `${paperSize}_${colorMode}_${sides}`;
  const minorPerSheet = rates[key];
  if (!Number.isInteger(minorPerSheet)) throw new Error('This print configuration is not offered by the shop');
  const sheets = sides === 'DUPLEX' ? Math.ceil(pages / 2) : pages;
  return { key, sheets, amountMinor: sheets * copies * minorPerSheet };
}

export function isSafeServiceField(field) {
  const blocked = /(?:password|passcode|otp|one[- ]?time|pin|biometric|digi ?locker)/i;
  return !blocked.test(`${field.name ?? ''} ${field.label ?? ''} ${field.helpText ?? ''}`);
}

export function autoPrintDecision({ request, print, attachment, rules, paymentStatus }) {
  if (!rules?.enabled) return { eligible: false, reason: 'Auto-print is disabled' };
  if (rules.paidOnly && paymentStatus !== PaymentStatus.PAID) return { eligible: false, reason: 'Payment is not verified' };
  if (rules.blackAndWhiteOnly && print.colorMode !== 'BW') return { eligible: false, reason: 'Only B&W jobs are eligible' };
  if (rules.paperSizes?.length && !rules.paperSizes.includes(print.paperSize)) return { eligible: false, reason: 'Paper size is not eligible' };
  if (rules.pdfOnly && attachment.mimeType !== 'application/pdf') return { eligible: false, reason: 'Only PDFs are eligible' };
  if (rules.maxPages && print.selectedPageCount > rules.maxPages) return { eligible: false, reason: 'Page count exceeds the auto-print limit' };
  if (!rules.printerId) return { eligible: false, reason: 'No auto-print printer is configured' };
  return { eligible: true, printerId: rules.printerId };
}

export function statusLabel(state) {
  return {
    AWAITING_QUOTE: 'Reviewing quote',
    AWAITING_PAYMENT: 'Payment needed',
    PAID: 'Payment confirmed',
    SUBMITTED: 'Sent to shop',
    ACCEPTED: 'Accepted',
    PROCESSING: 'In progress',
    PRINTING: 'Printing',
    CUSTOMER_ACTION_REQUIRED: 'Action needed',
    READY: 'Ready to collect',
    COMPLETED: 'Completed',
    REJECTED: 'Not accepted',
    CANCELLED: 'Cancelled',
    FAILED: 'Needs attention',
    REFUND_PENDING: 'Refund pending',
    REFUNDED: 'Refunded',
    DRAFT: 'Draft',
  }[state] ?? state;
}

export function validateInventoryAllocation(product, requestedQuantity) {
  if (!product.trackInventory) return { ok: true };
  if (product.quantity < requestedQuantity) {
    return {
      ok: false,
      reason: `Only ${product.quantity} unit(s) of "${product.name}" available.`,
      available: product.quantity,
    };
  }
  return { ok: true };
}
