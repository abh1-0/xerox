import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const dataDirectory = mkdtempSync(join(tmpdir(), 'sprint-api-test-'));
process.env.SPRINT_DATA_DIR = dataDirectory;
process.env.NODE_ENV = 'test';
const { server, db } = await import('../src/server.js');
let baseUrl;
async function request(path, options = {}) { const response = await fetch(`${baseUrl}${path}`, options); return { response, body: await response.json() }; }
before(async () => { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });

test('customer → paid request → merchant print execution → ready stays one lifecycle', async () => {
  const session = await request('/v1/customer/sessions', { method: 'POST' }); assert.equal(session.response.status, 201);
  const headers = { 'X-Sprint-Session': session.body.token }; const shop = await request('/v1/shops/abh1-demo'); assert.equal(shop.body.status, 'OPEN');
  const form = new FormData(); form.set('shopSlug', 'abh1-demo'); form.set('file', new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj'], { type: 'application/pdf' }), 'request.pdf');
  const upload = await request('/v1/customer/attachments', { method: 'POST', headers, body: form }); assert.equal(upload.response.status, 201);
  const create = await request('/v1/customer/requests', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'request-idempotency-key-0001' }, body: JSON.stringify({ shopSlug: 'abh1-demo', type: 'PRINT', attachmentIds: [upload.body.id], paymentTiming: 'BEFORE_SUBMISSION', print: { pageRange: 'all', copies: 1, colorMode: 'BW', paperSize: 'A4', sides: 'SINGLE', orientation: 'AUTO', scaleMode: 'FIT' } }) });
  assert.equal(create.response.status, 201); assert.equal(create.body.request.state, 'AWAITING_PAYMENT');
  const replay = await request('/v1/customer/requests', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Idempotency-Key': 'request-idempotency-key-0001' }, body: JSON.stringify({ shopSlug: 'abh1-demo', type: 'PRINT', attachmentIds: [upload.body.id], print: {} }) });
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true'); assert.equal(replay.body.request.id, create.body.request.id);
  const payment = await request(`/v1/customer/requests/${create.body.request.id}/pay-development`, { method: 'POST', headers: { ...headers, 'X-Idempotency-Key': 'payment-idempotency-key-0001' } }); assert.equal(payment.body.request.state, 'SUBMITTED');
  const registration = await request('/v1/merchant/devices/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Merchant-Setup-Key': 'replace-this-development-setup-key' }, body: JSON.stringify({ shopSlug: 'abh1-demo', name: 'Test device', version: '0.1.0' }) });
  const deviceHeaders = { 'X-Sprint-Device': registration.body.deviceToken, 'Content-Type': 'application/json' }; const queue = await request('/v1/merchant/requests', { headers: deviceHeaders }); assert.equal(queue.body.requests.some((item) => item.id === create.body.request.id), true);
  const accepted = await request(`/v1/merchant/requests/${create.body.request.id}/transition`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ state: 'ACCEPTED' }) }); assert.equal(accepted.body.request.state, 'ACCEPTED');
  const execution = await request(`/v1/merchant/requests/${create.body.request.id}/print-executions`, { method: 'POST', headers: { ...deviceHeaders, 'X-Idempotency-Key': 'print-idempotency-key-000001' }, body: JSON.stringify({ printerId: 'Test PDF Printer' }) }); assert.equal(execution.body.execution.state, 'PENDING');
  const submitted = await request(`/v1/merchant/print-executions/${execution.body.execution.id}`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ state: 'SUBMITTED', detail: 'Submitted in software test' }) }); assert.equal(submitted.body.request.state, 'PROCESSING');
  const ready = await request(`/v1/merchant/requests/${create.body.request.id}/transition`, { method: 'POST', headers: deviceHeaders, body: JSON.stringify({ state: 'READY' }) }); assert.equal(ready.body.request.state, 'READY');
  const customerView = await request(`/v1/customer/requests/${create.body.request.id}`, { headers }); assert.equal(customerView.body.request.state, 'READY');
});

test('service safety and customer authorization boundaries are enforced', async () => {
  const first = await request('/v1/customer/sessions', { method: 'POST' }); const second = await request('/v1/customer/sessions', { method: 'POST' }); const service = (await request('/v1/shops/abh1-demo')).body.services[0];
  const create = await request('/v1/customer/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sprint-Session': first.body.token, 'X-Idempotency-Key': 'service-idempotency-key-0001' }, body: JSON.stringify({ shopSlug: 'abh1-demo', type: 'SERVICE', attachmentIds: [], serviceDefinitionId: service.id, fieldValues: { fullName: 'A customer', consent: true }, paymentTiming: 'AT_COUNTER' }) });
  assert.equal(create.response.status, 201); assert.equal(create.body.request.type, 'SERVICE');
  const forbidden = await request(`/v1/customer/requests/${create.body.request.id}`, { headers: { 'X-Sprint-Session': second.body.token } }); assert.equal(forbidden.response.status, 404);
});
