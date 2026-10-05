import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoPrintDecision,
  calculatePrintPrice,
  canTransition,
  computeAggregateRequestState,
  generateStoreCode,
  isSafeServiceField,
  isValidStoreCode,
  ItemStatus,
  normalizeStoreCode,
  parsePageRange,
  RequestState,
  STORE_CODE_ALPHABET,
  validateInventoryAllocation,
} from '../index.js';

test('price uses integer minor units and duplex sheets', () => {
  assert.deepEqual(
    calculatePrintPrice(
      { pages: 5, copies: 2, colorMode: 'BW', paperSize: 'A4', sides: 'DUPLEX' },
      { A4_BW_DUPLEX: 300 }
    ),
    { key: 'A4_BW_DUPLEX', sheets: 3, amountMinor: 1800 }
  );
});

test('custom page ranges are normalized and bounded', () => {
  assert.deepEqual(parsePageRange('3-4, 1, 3', 5), [1, 3, 4]);
  assert.throws(() => parsePageRange('0', 5));
  assert.throws(() => parsePageRange('1-10', 5));
});

test('lifecycle transitions follow valid rules', () => {
  assert.equal(canTransition(RequestState.SUBMITTED, RequestState.ACCEPTED), true);
  assert.equal(canTransition(RequestState.SUBMITTED, RequestState.COMPLETED), false);
  assert.equal(canTransition(RequestState.AWAITING_PAYMENT, RequestState.PAID), true);
  assert.equal(canTransition(RequestState.AWAITING_PAYMENT, RequestState.READY), false);
});

test('auto-print keeps uncertain payment out of physical execution', () => {
  assert.equal(
    autoPrintDecision({
      request: {},
      print: { colorMode: 'BW', paperSize: 'A4', selectedPageCount: 4 },
      attachment: { mimeType: 'application/pdf' },
      paymentStatus: 'PENDING',
      rules: {
        enabled: true,
        paidOnly: true,
        blackAndWhiteOnly: true,
        paperSizes: ['A4'],
        pdfOnly: true,
        maxPages: 10,
        printerId: 'printer-1',
      },
    }).eligible,
    false
  );
});

test('store code generation produces length 5 uppercase codes in alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateStoreCode();
    assert.equal(code.length, 5);
    assert.match(code, /^[2-9A-HJ-NP-Z]{5}$/);
    for (const char of code) {
      assert.ok(STORE_CODE_ALPHABET.includes(char), `Character ${char} not in alphabet`);
    }
  }
});

test('store code normalization handles lowercase and whitespace', () => {
  assert.equal(normalizeStoreCode('  7kd3p  '), '7KD3P');
  assert.equal(isValidStoreCode('7kd3p'), true);
  assert.equal(isValidStoreCode('7KD3P'), true);
  assert.equal(isValidStoreCode('7KD3'), false); // too short
  assert.equal(isValidStoreCode('7KD3PO'), false); // too long and contains O
  assert.equal(isValidStoreCode('7KD30'), false); // contains 0
  assert.equal(isValidStoreCode('7KD1P'), false); // contains 1
});

test('aggregate request state reflects individual item statuses', () => {
  // All completed -> COMPLETED
  assert.equal(
    computeAggregateRequestState([
      { status: ItemStatus.COMPLETED },
      { status: ItemStatus.COMPLETED },
    ]),
    RequestState.COMPLETED
  );

  // All ready or completed -> READY
  assert.equal(
    computeAggregateRequestState([
      { status: ItemStatus.READY },
      { status: ItemStatus.COMPLETED },
    ]),
    RequestState.READY
  );

  // One processing -> PROCESSING
  assert.equal(
    computeAggregateRequestState([
      { status: ItemStatus.READY },
      { status: ItemStatus.PROCESSING },
    ]),
    RequestState.PROCESSING
  );

  // One printing -> PRINTING
  assert.equal(
    computeAggregateRequestState([
      { status: ItemStatus.READY },
      { status: ItemStatus.PRINTING },
    ]),
    RequestState.PRINTING
  );
});

test('inventory allocation handles tracked and untracked products', () => {
  assert.equal(
    validateInventoryAllocation({ trackInventory: false, quantity: 0 }, 5).ok,
    true
  );
  assert.equal(
    validateInventoryAllocation({ trackInventory: true, quantity: 10, name: 'Pen' }, 5).ok,
    true
  );
  const fail = validateInventoryAllocation({ trackInventory: true, quantity: 2, name: 'Pen' }, 5);
  assert.equal(fail.ok, false);
  assert.equal(fail.available, 2);
});

test('isSafeServiceField blocks prohibited secrets', () => {
  assert.equal(isSafeServiceField({ name: 'fullName', label: 'Full Name' }), true);
  assert.equal(isSafeServiceField({ name: 'digilockerPin', label: 'DigiLocker PIN' }), false);
  assert.equal(isSafeServiceField({ name: 'otp', label: 'Aadhaar OTP' }), false);
  assert.equal(isSafeServiceField({ name: 'accountPassword', label: 'Password' }), false);
});
