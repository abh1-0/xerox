import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { ItemType, ItemStatus, RequestState, PaymentMethod, PaymentStatus } from '@sprint/contracts';

const dataDirectory = mkdtempSync(join(tmpdir(), 'sprint-api-test-'));
process.env.SPRINT_DATA_DIR = dataDirectory;
process.env.NODE_ENV = 'test';
process.env.SPRINT_ADMIN_TOKEN = 'test-admin-secret-2026';

const { server, db } = await import('../src/server.js');
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

test('primary acceptance flow: admin creates merchant & store, 5-char code generated, customer print flow to ready', async () => {
  const adminHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': 'test-admin-secret-2026' };

  // 1. Admin creates merchant
  const mRes = await request('/v1/admin/merchants', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name: 'Sai Xerox Pvt Ltd', slug: 'sai-xerox', contactEmail: 'sai@xerox.in' }),
  });
  assert.equal(mRes.response.status, 201);
  const merchantId = mRes.body.id;

  // 2. Admin creates store under merchant
  const sRes = await request('/v1/admin/stores', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      merchantId,
      displayName: 'Sai Xerox — Uppal',
      address: 'Near Metro Pillar 42',
      city: 'Hyderabad',
    }),
  });
  assert.equal(sRes.response.status, 201);
  const storeCode = sRes.body.storeCode;
  assert.equal(storeCode.length, 5);
  assert.equal(sRes.body.canonicalUrl, `https://sprint.abh1.xyz/s/${storeCode}`);

  // 3. Customer opens /s/:code (case-insensitive lookup works!)
  const storeLower = await request(`/v1/shops/${storeCode.toLowerCase()}`);
  assert.equal(storeLower.response.status, 200);
  assert.equal(storeLower.body.storeCode, storeCode);
  assert.equal(storeLower.body.displayName, 'Sai Xerox — Uppal');

  // 4. Customer uploads document
  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const custHeaders = { 'X-Sprint-Session': session.body.token };
  const form = new FormData();
  form.set('storeCode', storeCode);
  form.set('file', new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj'], { type: 'application/pdf' }), 'resume.pdf');
  const upload = await request('/v1/customer/attachments', { method: 'POST', headers: custHeaders, body: form });
  assert.equal(upload.response.status, 201);

  // 5. Customer submits print order
  const orderRes = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { ...custHeaders, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'print-order-001' },
    body: JSON.stringify({
      storeCode,
      type: 'PRINT',
      items: [
        {
          type: 'PRINT',
          attachmentIds: [upload.body.id],
          print: { pageRange: 'all', copies: 1, colorMode: 'BW', paperSize: 'A4', sides: 'SINGLE' },
        },
      ],
      paymentTiming: 'BEFORE_SUBMISSION',
    }),
  });
  assert.equal(orderRes.response.status, 201);
  const order = orderRes.body.request;
  assert.equal(order.state, RequestState.AWAITING_PAYMENT);
  assert.equal(order.amountMinor, 200);

  // 6. Customer pays
  const payRes = await request(`/v1/customer/requests/${order.id}/pay-development`, {
    method: 'POST',
    headers: { ...custHeaders, 'X-Idempotency-Key': 'pay-key-001' },
  });
  assert.equal(payRes.body.request.state, RequestState.SUBMITTED);
  assert.equal(payRes.body.request.paymentStatus, PaymentStatus.PAID);

  // 7. Merchant registers device and fulfills print
  const regRes = await request('/v1/merchant/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' },
    body: JSON.stringify({ shopSlug: storeCode, name: 'Uppal Counter Terminal' }),
  });
  const deviceHeaders = { 'X-Sprint-Device': regRes.body.deviceToken, 'Content-Type': 'application/json' };

  // Merchant accepts
  const accRes = await request(`/v1/merchant/requests/${order.id}/transition`, {
    method: 'POST',
    headers: deviceHeaders,
    body: JSON.stringify({ state: RequestState.ACCEPTED }),
  });
  assert.equal(accRes.body.request.state, RequestState.ACCEPTED);

  // Merchant prints
  const execRes = await request(`/v1/merchant/requests/${order.id}/print-executions`, {
    method: 'POST',
    headers: { ...deviceHeaders, 'X-Idempotency-Key': 'exec-001' },
    body: JSON.stringify({ printerId: 'Canon LBP2900' }),
  });
  assert.equal(execRes.response.status, 201);

  // Spooler completes
  const spoolRes = await request(`/v1/merchant/print-executions/${execRes.body.execution.id}`, {
    method: 'POST',
    headers: deviceHeaders,
    body: JSON.stringify({ state: 'COMPLETED', detail: 'Sent to spooler' }),
  });
  assert.equal(spoolRes.body.request.state, RequestState.READY);

  // 8. Customer sees Ready
  const custCheck = await request(`/v1/customer/requests/${order.id}`, { headers: custHeaders });
  assert.equal(custCheck.body.request.state, RequestState.READY);
});

test('stationery acceptance test: browse products, quantity checkout, inventory tracking', async () => {
  // abh1-demo has 4 products seeded
  const shopRes = await request('/v1/shops/abh1-demo');
  assert.ok(shopRes.body.products.length >= 4);
  const pen = shopRes.body.products.find((p) => p.name.includes('Blue Ball Pen'));
  assert.ok(pen);
  const initialQty = pen.quantity;

  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const custHeaders = { 'X-Sprint-Session': session.body.token, 'Content-Type': 'application/json' };

  // Customer adds 2 pens
  const orderRes = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { ...custHeaders, 'X-Idempotency-Key': 'pen-order-001' },
    body: JSON.stringify({
      shopSlug: 'abh1-demo',
      type: 'STATIONERY',
      items: [
        {
          type: 'PRODUCT',
          productId: pen.id,
          quantity: 2,
        },
      ],
      paymentTiming: 'AT_COUNTER',
    }),
  });
  assert.equal(orderRes.response.status, 201);
  assert.equal(orderRes.body.request.amountMinor, 2000); // 1000 * 2 = 2000 minor
  assert.equal(orderRes.body.request.state, RequestState.SUBMITTED);

  // Check inventory decremented by 2
  const updatedShop = await request('/v1/shops/abh1-demo');
  const updatedPen = updatedShop.body.products.find((p) => p.id === pen.id);
  assert.equal(updatedPen.quantity, initialQty - 2);
});

test('mixed cart acceptance test: Print + Service + Stationery in ONE Request', async () => {
  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const custHeaders = { 'X-Sprint-Session': session.body.token };

  // 1. Upload PDF for printing
  const form = new FormData();
  form.set('shopSlug', 'abh1-demo');
  form.set('file', new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj'], { type: 'application/pdf' }), 'doc.pdf');
  const upload = await request('/v1/customer/attachments', { method: 'POST', headers: custHeaders, body: form });

  // 2. Fetch products and services
  const shop = await request('/v1/shops/abh1-demo');
  const folder = shop.body.products.find((p) => p.name.includes('Folder'));
  const lamination = shop.body.services.find((s) => s.name.includes('Lamination'));

  // 3. Create unified cart request:
  // - Print: 1 copy, 1 page B&W single = 200 paise
  // - Lamination: fixed 3000 paise
  // - Folder: 1 × 2000 paise
  // Total expected: 200 + 3000 + 2000 = 5200 paise (₹52)
  const cartRes = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { ...custHeaders, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'mixed-cart-001' },
    body: JSON.stringify({
      shopSlug: 'abh1-demo',
      type: 'MIXED',
      items: [
        {
          type: 'PRINT',
          attachmentIds: [upload.body.id],
          print: { pageRange: 'all', copies: 1, colorMode: 'BW', paperSize: 'A4', sides: 'SINGLE' },
        },
        {
          type: 'SERVICE',
          serviceDefinitionId: lamination.id,
          fieldValues: { copies: 1 },
        },
        {
          type: 'PRODUCT',
          productId: folder.id,
          quantity: 1,
        },
      ],
      paymentTiming: 'BEFORE_SUBMISSION',
    }),
  });
  assert.equal(cartRes.response.status, 201);
  const cart = cartRes.body.request;
  assert.equal(cart.type, 'MIXED');
  assert.equal(cart.amountMinor, 5200);
  assert.equal(cart.items.length, 3);
  assert.equal(cart.state, RequestState.AWAITING_PAYMENT);

  // Pay online
  const paid = await request(`/v1/customer/requests/${cart.id}/pay-development`, {
    method: 'POST',
    headers: { ...custHeaders, 'X-Idempotency-Key': 'mixed-pay-001' },
  });
  assert.equal(paid.body.request.state, RequestState.SUBMITTED);
  assert.equal(paid.body.request.paymentStatus, PaymentStatus.PAID);

  // Merchant updates item status individually
  const dev = await request('/v1/merchant/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' },
    body: JSON.stringify({ shopSlug: 'abh1-demo', name: 'Demo Counter' }),
  });
  const devHeaders = { 'X-Sprint-Device': dev.body.deviceToken, 'Content-Type': 'application/json' };

  // Merchant marks folder READY
  const folderItem = cart.items.find((i) => i.type === 'PRODUCT');
  const itemUpd = await request(`/v1/merchant/requests/${cart.id}/items/${folderItem.id}/transition`, {
    method: 'POST',
    headers: devHeaders,
    body: JSON.stringify({ status: ItemStatus.READY }),
  });
  // Overall state is now PROCESSING because 1 item is READY while others are PENDING
  assert.equal(itemUpd.body.request.state, RequestState.PROCESSING);
});

test('merchant quote acceptance test: quote proposed, accepted, transitions to payment', async () => {
  // Seed a service with MERCHANT_QUOTE price mode
  const quoteServiceId = 'quote_service_01';
  db.prepare(
    'INSERT OR REPLACE INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, sort_order, created_at, updated_at) VALUES (?, (SELECT id FROM shops WHERE slug = ?), ?, ?, ?, ?, 0, ?, ?, ?, 1, 10, ?, ?)'
  ).run(
    quoteServiceId,
    'abh1-demo',
    'Custom Book Binding',
    'FINISHING',
    'Hardcover or spiral binding on request.',
    'MERCHANT_QUOTE',
    'BEFORE_SUBMISSION',
    JSON.stringify([{ id: 'bindingType', name: 'bindingType', label: 'Binding Type', type: 'SHORT_TEXT', required: true }]),
    'Merchant will quote based on thickness.',
    new Date().toISOString(),
    new Date().toISOString()
  );

  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const custHeaders = { 'X-Sprint-Session': session.body.token, 'Content-Type': 'application/json' };

  // Customer submits quote request
  const reqRes = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { ...custHeaders, 'X-Idempotency-Key': 'quote-req-001' },
    body: JSON.stringify({
      shopSlug: 'abh1-demo',
      type: 'SERVICE',
      items: [
        {
          type: 'SERVICE',
          serviceDefinitionId: quoteServiceId,
          fieldValues: { bindingType: 'Spiral 200 pages' },
        },
      ],
      paymentTiming: 'BEFORE_SUBMISSION',
    }),
  });
  assert.equal(reqRes.response.status, 201);
  const quoteReq = reqRes.body.request;
  assert.equal(quoteReq.state, RequestState.AWAITING_QUOTE);

  // Merchant receives and proposes quote of ₹120 (12000 minor)
  const dev = await request('/v1/merchant/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' },
    body: JSON.stringify({ shopSlug: 'abh1-demo', name: 'Quote Counter' }),
  });
  const devHeaders = { 'X-Sprint-Device': dev.body.deviceToken, 'Content-Type': 'application/json' };

  const quoteProp = await request(`/v1/merchant/requests/${quoteReq.id}/quotes`, {
    method: 'POST',
    headers: devHeaders,
    body: JSON.stringify({ amountMinor: 12000, note: 'Includes transparent cover sheet' }),
  });
  assert.equal(quoteProp.response.status, 201);
  assert.equal(quoteProp.body.request.state, RequestState.CUSTOMER_ACTION_REQUIRED);

  // Customer accepts quote
  const quoteId = quoteProp.body.quote.id;
  const acceptRes = await request(`/v1/customer/requests/${quoteReq.id}/quotes/${quoteId}`, {
    method: 'POST',
    headers: custHeaders,
    body: JSON.stringify({ action: 'ACCEPT' }),
  });
  assert.equal(acceptRes.response.status, 200);
  assert.equal(acceptRes.body.request.state, RequestState.AWAITING_PAYMENT);
  assert.equal(acceptRes.body.request.amountMinor, 12000);
});

test('device pairing workflow: pair-request → pair-confirm → pair-poll → revocation', async () => {
  // 1. Windows app requests pairing code
  const pairReq = await request('/v1/merchant/devices/pair-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Windows POS Terminal 1' }),
  });
  assert.equal(pairReq.response.status, 201);
  const pairingCode = pairReq.body.pairingCode;
  assert.ok(pairingCode);

  // 2. Windows polls while pending
  const poll1 = await request('/v1/merchant/devices/pair-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode }),
  });
  assert.equal(poll1.body.status, 'PENDING');

  // 3. Merchant confirms in Merchant Portal
  const confirmRes = await request('/v1/merchant/devices/pair-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' },
    body: JSON.stringify({ pairingCode, storeId: 'abh1-demo' }),
  });
  assert.equal(confirmRes.response.status, 200);
  const deviceId = confirmRes.body.deviceId;

  // 4. Windows polls again and receives deviceToken
  const poll2 = await request('/v1/merchant/devices/pair-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode }),
  });
  assert.equal(poll2.body.status, 'CONFIRMED');
  assert.equal(poll2.body.deviceId, deviceId);
  assert.ok(poll2.body.deviceToken);

  // 5. Windows can authenticate with received token
  const devHeaders = { 'X-Sprint-Device': poll2.body.deviceToken };
  const queue = await request('/v1/merchant/requests', { headers: devHeaders });
  assert.equal(queue.response.status, 200);

  // 6. Admin revokes device
  const revokeRes = await request(`/v1/admin/devices/${deviceId}/revoke`, {
    method: 'POST',
    headers: { 'X-Admin-Token': 'test-admin-secret-2026' },
  });
  assert.equal(revokeRes.body.status, 'REVOKED');

  // 7. Revoked device is denied access
  const denied = await request('/v1/merchant/requests', { headers: devHeaders });
  assert.equal(denied.response.status, 401);
});

test('multi-store authorization: merchant A device cannot access merchant B requests', async () => {
  // Store A device
  const devA = await request('/v1/merchant/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' },
    body: JSON.stringify({ shopSlug: 'abh1-demo', name: 'Store A Terminal' }),
  });

  // Admin creates Store B
  const sB = await request('/v1/admin/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'test-admin-secret-2026' },
    body: JSON.stringify({ displayName: 'Store B Isolated' }),
  });

  // Customer places order in Store B
  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const bOrder = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { 'X-Sprint-Session': session.body.token, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'b-order-001' },
    body: JSON.stringify({
      storeCode: sB.body.storeCode,
      type: 'SERVICE',
      items: [
        {
          type: 'SERVICE',
          serviceDefinitionId: (await request(`/v1/shops/${sB.body.storeCode}`)).body.services[0].id,
          fieldValues: { copies: 1 },
        },
      ],
      paymentTiming: 'AT_COUNTER',
    }),
  });
  assert.equal(bOrder.response.status, 201);
  const bRequestId = bOrder.body.request.id;

  // Device A attempts to transition Store B request -> DENIED 404
  const breach = await request(`/v1/merchant/requests/${bRequestId}/transition`, {
    method: 'POST',
    headers: { 'X-Sprint-Device': devA.body.deviceToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'ACCEPTED' }),
  });
  assert.equal(breach.response.status, 404);
});

test('store suspension blocks new customer submissions', async () => {
  // Admin suspends abh1-demo
  const suspendRes = await request('/v1/admin/stores/abh1-demo', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'test-admin-secret-2026' },
    body: JSON.stringify({ operationalStatus: 'SUSPENDED_BY_ABH1' }),
  });
  assert.equal(suspendRes.body.operationalStatus, 'SUSPENDED_BY_ABH1');

  // Customer tries to submit -> 403 Forbidden
  const session = await request('/v1/customer/sessions', { method: 'POST' });
  const blocked = await request('/v1/customer/requests', {
    method: 'POST',
    headers: { 'X-Sprint-Session': session.body.token, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'susp-order-001' },
    body: JSON.stringify({
      shopSlug: 'abh1-demo',
      type: 'STATIONERY',
      items: [{ type: 'PRODUCT', productId: 'any', quantity: 1 }],
    }),
  });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.body.error.code, 'SHOP_SUSPENDED');

  // Reactivate store
  await request('/v1/admin/stores/abh1-demo', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'test-admin-secret-2026' },
    body: JSON.stringify({ operationalStatus: 'ACTIVE' }),
  });
});
