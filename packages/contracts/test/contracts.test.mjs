import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPrintDecision, calculatePrintPrice, canTransition, parsePageRange } from '../index.js';

test('price uses integer minor units and duplex sheets', () => {
  assert.deepEqual(calculatePrintPrice({ pages: 5, copies: 2, colorMode: 'BW', paperSize: 'A4', sides: 'DUPLEX' }, { A4_BW_DUPLEX: 300 }), { key: 'A4_BW_DUPLEX', sheets: 3, amountMinor: 1800 });
});
test('custom page ranges are normalized and bounded', () => {
  assert.deepEqual(parsePageRange('3-4, 1, 3', 5), [1, 3, 4]);
  assert.throws(() => parsePageRange('0', 5));
});
test('lifecycle rejects arbitrary state jumps', () => {
  assert.equal(canTransition('SUBMITTED', 'ACCEPTED'), true);
  assert.equal(canTransition('SUBMITTED', 'COMPLETED'), false);
});
test('auto-print keeps uncertain payment out of physical execution', () => {
  assert.equal(autoPrintDecision({ request: {}, print: { colorMode: 'BW', paperSize: 'A4', selectedPageCount: 4 }, attachment: { mimeType: 'application/pdf' }, paymentStatus: 'PENDING', rules: { enabled: true, paidOnly: true, blackAndWhiteOnly: true, paperSizes: ['A4'], pdfOnly: true, maxPages: 10, printerId: 'printer-1' } }).eligible, false);
});
