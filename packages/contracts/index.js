export const RequestType = Object.freeze({
  PRINT: 'PRINT',
  COPY: 'COPY',
  SCAN: 'SCAN',
  SERVICE: 'SERVICE',
});

export const RequestState = Object.freeze({
  DRAFT: 'DRAFT',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  SUBMITTED: 'SUBMITTED',
  ACCEPTED: 'ACCEPTED',
  PROCESSING: 'PROCESSING',
  CUSTOMER_ACTION_REQUIRED: 'CUSTOMER_ACTION_REQUIRED',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
});

export const PaymentStatus = Object.freeze({ PENDING: 'PENDING', PAID: 'PAID', FAILED: 'FAILED', REFUNDED: 'REFUNDED' });

const transitions = new Map([
  [RequestState.DRAFT, [RequestState.AWAITING_PAYMENT, RequestState.SUBMITTED, RequestState.CANCELLED]],
  [RequestState.AWAITING_PAYMENT, [RequestState.PAID, RequestState.CANCELLED, RequestState.FAILED]],
  [RequestState.PAID, [RequestState.SUBMITTED, RequestState.REFUND_PENDING]],
  [RequestState.SUBMITTED, [RequestState.ACCEPTED, RequestState.REJECTED, RequestState.CANCELLED]],
  [RequestState.ACCEPTED, [RequestState.PROCESSING, RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.READY, RequestState.REJECTED]],
  [RequestState.PROCESSING, [RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.READY, RequestState.COMPLETED, RequestState.FAILED]],
  [RequestState.CUSTOMER_ACTION_REQUIRED, [RequestState.PROCESSING, RequestState.CANCELLED, RequestState.REJECTED]],
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

export function parsePageRange(value, totalPages) {
  const raw = String(value ?? 'all').trim().toLowerCase();
  if (raw === 'all') return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (!Number.isInteger(totalPages) || totalPages < 1) throw new Error('A known page count is required for custom ranges');
  const pages = new Set();
  for (const segment of raw.split(',')) {
    const [startText, endText] = segment.trim().split('-');
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
    AWAITING_PAYMENT: 'Payment needed', PAID: 'Payment confirmed', SUBMITTED: 'Sent to shop',
    ACCEPTED: 'Accepted', PROCESSING: 'In progress', CUSTOMER_ACTION_REQUIRED: 'Action needed',
    READY: 'Ready to collect', COMPLETED: 'Completed', REJECTED: 'Not accepted', CANCELLED: 'Cancelled',
    FAILED: 'Needs attention', REFUND_PENDING: 'Refund pending', REFUNDED: 'Refunded', DRAFT: 'Draft',
  }[state] ?? state;
}
