import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { RequestState, RequestType, PaymentStatus, assertTransition, autoPrintDecision, calculatePrintPrice, isSafeServiceField, parsePageRange, statusLabel } from '@sprint/contracts';
import { dataDirectory, migrate, openDatabase, seed } from './migrate.js';

const storageDirectory = process.env.SPRINT_STORAGE_DIR || join(dataDirectory, 'objects');
const uploadLimit = Number(process.env.SPRINT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const isProduction = process.env.NODE_ENV === 'production';
const developmentPayments = process.env.SPRINT_DEVELOPMENT_PAYMENTS === 'true' || !isProduction;
const setupKey = process.env.SPRINT_DEVELOPMENT_SETUP_KEY || 'replace-this-development-setup-key';
const allowedOrigin = process.env.SPRINT_WEB_ORIGIN || 'http://localhost:5173';

class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

const now = () => new Date().toISOString();
const id = () => randomUUID();
const token = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const safeName = (name) => basename(String(name || 'document')).replace(/[^\w.() -]/g, '_').slice(0, 120) || 'document';
const db = migrate(openDatabase());
seed(db);
mkdirSync(storageDirectory, { recursive: true });

function log(level, event, fields = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !/token|file|name|content|document/i.test(key)));
  console[level](JSON.stringify({ timestamp: now(), level, event, ...safe }));
}

function audit({ requestId = null, actorType, actorId = null, action, correlationId, metadata = {} }) {
  db.prepare('INSERT INTO audit_logs (id, request_id, actor_type, actor_id, action, request_correlation_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id(), requestId, actorType, actorId, action, correlationId, JSON.stringify(metadata), now());
}

function event({ requestId, eventType, previousState = null, nextState = null, actorType, actorId = null, metadata = {} }) {
  db.prepare('INSERT INTO request_events (id, request_id, event_type, previous_state, next_state, actor_type, actor_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id(), requestId, eventType, previousState, nextState, actorType, actorId, JSON.stringify(metadata), now());
}

function getSession(sessionToken) {
  if (!sessionToken) throw new HttpError(401, 'SESSION_REQUIRED', 'Start a Sprint session before continuing.');
  const session = db.prepare('SELECT * FROM customer_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?').get(hash(sessionToken), now());
  if (!session) throw new HttpError(401, 'SESSION_INVALID', 'Your Sprint session has expired. Start a new request.');
  return session;
}

function customerAuth(req, _res, next) {
  try { req.customerSession = getSession(req.header('x-sprint-session')); next(); } catch (error) { next(error); }
}

function getDevice(deviceToken) {
  if (!deviceToken) throw new HttpError(401, 'DEVICE_REQUIRED', 'This action requires a registered Sprint device.');
  const device = db.prepare('SELECT * FROM merchant_devices WHERE token_hash = ? AND status = ?').get(hash(deviceToken), 'ACTIVE');
  if (!device) throw new HttpError(401, 'DEVICE_INVALID', 'This Sprint device is not authorized.');
  db.prepare('UPDATE merchant_devices SET last_seen_at = ? WHERE id = ?').run(now(), device.id);
  return device;
}

function deviceAuth(req, _res, next) {
  try { req.device = getDevice(req.header('x-sprint-device')); next(); } catch (error) { next(error); }
}

function shopBySlug(slug) {
  const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(slug);
  if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'This Sprint shop is unavailable.');
  return shop;
}

function responseRequest(row, includeCustomerData = false) {
  const print = db.prepare('SELECT * FROM print_request_details WHERE request_id = ?').get(row.id);
  const service = db.prepare('SELECT * FROM service_request_details WHERE request_id = ?').get(row.id);
  const attachments = db.prepare('SELECT id, original_name, mime_type, size_bytes, page_count FROM request_attachments WHERE request_id = ? AND deleted_at IS NULL').all(row.id);
  return {
    id: row.id, requestNumber: row.request_number, type: row.type, state: row.state, stateLabel: statusLabel(row.state),
    amountMinor: row.amount_minor, currency: row.currency, paymentStatus: row.payment_status, createdAt: row.created_at, updatedAt: row.updated_at,
    print: print && { pageRange: print.page_range, selectedPageCount: print.selected_page_count, copies: print.copies, colorMode: print.color_mode, paperSize: print.paper_size, sides: print.sides, orientation: print.orientation, scaleMode: print.scale_mode },
    service: service && { values: includeCustomerData ? json(service.field_values_json) : undefined, customerNote: includeCustomerData ? service.customer_note : undefined },
    attachments,
  };
}

function requestBelongsToShop(requestId, shopId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ? AND shop_id = ?').get(requestId, shopId);
  if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  return request;
}

function transitionRequest(request, nextState, actorType, actorId, correlationId, metadata = {}) {
  assertTransition(request.state, nextState);
  const timestamp = now();
  db.prepare('UPDATE requests SET state = ?, updated_at = ? WHERE id = ?').run(nextState, timestamp, request.id);
  event({ requestId: request.id, eventType: 'STATE_CHANGED', previousState: request.state, nextState, actorType, actorId, metadata });
  audit({ requestId: request.id, actorType, actorId, action: `REQUEST_${nextState}`, correlationId, metadata });
  const updated = { ...request, state: nextState, updated_at: timestamp };
  broadcastRequest(updated);
  return updated;
}

const connections = new Set();
const tickets = new Map();
function issueTicket(principal) {
  const value = token();
  tickets.set(value, { principal, expiresAt: Date.now() + 60_000 });
  return value;
}
function broadcastRequest(request) {
  const message = JSON.stringify({ type: 'request.updated', requestId: request.id, shopId: request.shop_id, state: request.state, at: request.updated_at });
  for (const socket of connections) {
    if (socket.readyState !== socket.OPEN) continue;
    const principal = socket.principal;
    if ((principal.kind === 'customer' && principal.sessionId === request.customer_session_id) || (principal.kind === 'device' && principal.shopId === request.shop_id)) socket.send(message);
  }
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'X-Sprint-Session', 'X-Sprint-Device', 'X-Idempotency-Key', 'X-Merchant-Setup-Key'], credentials: false }));
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  req.correlationId = req.header('x-request-id') || id();
  res.setHeader('x-request-id', req.correlationId);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0', database: 'connected', realtime: 'ready' }));

app.post('/v1/customer/sessions', (req, res) => {
  const sessionToken = token();
  const sessionId = id();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO customer_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sessionId, hash(sessionToken), createdAt, expiresAt);
  audit({ actorType: 'CUSTOMER', actorId: sessionId, action: 'CUSTOMER_SESSION_CREATED', correlationId: req.correlationId });
  res.status(201).json({ token: sessionToken, expiresAt });
});

app.get('/v1/shops/:slug', (req, res, next) => {
  try {
    const shop = shopBySlug(req.params.slug);
    const services = db.prepare('SELECT id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions FROM service_definitions WHERE shop_id = ? AND enabled = 1 ORDER BY name').all(shop.id)
      .map((service) => ({ id: service.id, name: service.name, category: service.category, description: service.description, priceMode: service.price_mode, priceMinor: service.price_minor, paymentTiming: service.payment_timing, fields: json(service.fields_json, []), instructions: service.instructions }));
    res.json({ id: shop.id, slug: shop.slug, displayName: shop.display_name, status: shop.status, currency: shop.currency, printOptions: Object.keys(json(shop.rates_json)).map((key) => key.split('_')), services });
  } catch (error) { next(error); }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: uploadLimit, files: 1 }, fileFilter: (_req, file, done) => done(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) });
app.post('/v1/customer/attachments', customerAuth, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose a PDF, JPG, or PNG document.');
    const shop = shopBySlug(req.body.shopSlug);
    const signature = req.file.buffer.subarray(0, 8).toString('binary');
    const validPdf = req.file.mimetype === 'application/pdf' && req.file.buffer.subarray(0, 5).toString() === '%PDF-';
    const validPng = req.file.mimetype === 'image/png' && signature.startsWith('\x89PNG');
    const validJpeg = req.file.mimetype === 'image/jpeg' && req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8;
    if (!validPdf && !validPng && !validJpeg) throw new HttpError(415, 'FILE_INVALID', 'The file content does not match a supported document type.');
    const attachmentId = id();
    const extension = req.file.mimetype === 'application/pdf' ? '.pdf' : req.file.mimetype === 'image/png' ? '.png' : '.jpg';
    const objectKey = `${new Date().toISOString().slice(0, 10)}/${attachmentId}${extension}`;
    const filePath = resolve(storageDirectory, objectKey);
    mkdirSync(resolve(filePath, '..'), { recursive: true });
    writeFileSync(filePath, req.file.buffer, { flag: 'wx' });
    const pageCount = req.file.mimetype === 'application/pdf' ? Math.max(1, (req.file.buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length) : 1;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO request_attachments (id, customer_session_id, shop_id, object_key, original_name, mime_type, size_bytes, checksum, page_count, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(attachmentId, req.customerSession.id, shop.id, objectKey, safeName(req.file.originalname), req.file.mimetype, req.file.size, hash(req.file.buffer), pageCount, now(), expiresAt);
    audit({ actorType: 'CUSTOMER', actorId: req.customerSession.id, action: 'ATTACHMENT_UPLOADED', correlationId: req.correlationId, metadata: { attachmentId, shopId: shop.id, mimeType: req.file.mimetype, sizeBytes: req.file.size } });
    res.status(201).json({ id: attachmentId, originalName: safeName(req.file.originalname), mimeType: req.file.mimetype, sizeBytes: req.file.size, pageCount, expiresAt });
  } catch (error) { next(error); }
});

function rememberIdempotent(scope, key, callback) {
  if (!key || key.length < 12 || key.length > 200) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique idempotency key for this request.');
  const existing = db.prepare('SELECT response_json, status_code FROM idempotency_keys WHERE scope = ? AND key = ?').get(scope, key);
  if (existing) return { replay: true, status: existing.status_code, body: json(existing.response_json) };
  const result = callback();
  db.prepare('INSERT INTO idempotency_keys (scope, key, response_json, status_code, created_at) VALUES (?, ?, ?, ?, ?)').run(scope, key, JSON.stringify(result.body), result.status, now());
  return { replay: false, ...result };
}

function nextRequestNumber() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM requests').get();
  return `S-${4821 + row.count}`;
}

app.post('/v1/customer/requests', customerAuth, (req, res, next) => {
  try {
    const result = rememberIdempotent(`customer:${req.customerSession.id}:request`, req.header('x-idempotency-key'), () => {
      const { shopSlug, type, attachmentIds, print, serviceDefinitionId, fieldValues = {}, customerNote = '', paymentTiming = 'BEFORE_SUBMISSION' } = req.body;
      const shop = shopBySlug(shopSlug);
      if (shop.status !== 'OPEN') throw new HttpError(409, 'SHOP_PAUSED', 'This shop is currently paused and cannot receive new requests.');
      if (!Object.values(RequestType).includes(type)) throw new HttpError(400, 'REQUEST_TYPE_INVALID', 'Choose a supported Sprint request type.');
      if (!Array.isArray(attachmentIds)) throw new HttpError(400, 'ATTACHMENTS_INVALID', 'Attachments must be provided as a list.');
      const placeholders = attachmentIds.map(() => '?').join(',');
      const attachments = attachmentIds.length ? db.prepare(`SELECT * FROM request_attachments WHERE id IN (${placeholders}) AND customer_session_id = ? AND shop_id = ? AND request_id IS NULL AND deleted_at IS NULL AND expires_at > ?`).all(...attachmentIds, req.customerSession.id, shop.id, now()) : [];
      if (attachments.length !== attachmentIds.length) throw new HttpError(403, 'ATTACHMENT_ACCESS_DENIED', 'One or more selected documents are no longer available for this request.');
      let amountMinor = 0; let paymentStatus = paymentTiming === 'AT_COUNTER' ? PaymentStatus.PENDING : PaymentStatus.PENDING; let printDetails = null; let service = null;
      if (type === RequestType.PRINT) {
        if (attachments.length !== 1) throw new HttpError(400, 'PRINT_ATTACHMENT_COUNT', 'Send one document per print request.');
        const attachment = attachments[0];
        const selectedPages = parsePageRange(print?.pageRange, attachment.page_count);
        const normalized = { pages: selectedPages.length, copies: Number(print?.copies), colorMode: print?.colorMode, paperSize: print?.paperSize, sides: print?.sides };
        const price = calculatePrintPrice(normalized, json(shop.rates_json));
        amountMinor = price.amountMinor;
        printDetails = { pageRange: print?.pageRange || 'all', selectedPageCount: selectedPages.length, copies: normalized.copies, colorMode: normalized.colorMode, paperSize: normalized.paperSize, sides: normalized.sides, orientation: print?.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'AUTO', scaleMode: print?.scaleMode === 'ACTUAL' ? 'ACTUAL' : 'FIT' };
      } else if (type === RequestType.SERVICE) {
        service = db.prepare('SELECT * FROM service_definitions WHERE id = ? AND shop_id = ? AND enabled = 1').get(serviceDefinitionId, shop.id);
        if (!service) throw new HttpError(404, 'SERVICE_NOT_AVAILABLE', 'This service is not currently available.');
        const fields = json(service.fields_json, []);
        if (!fields.every(isSafeServiceField)) throw new HttpError(409, 'SERVICE_FIELD_UNSAFE', 'This service needs a safe merchant configuration before it can accept requests.');
        for (const field of fields.filter((field) => field.required)) if (!fieldValues[field.id]) throw new HttpError(400, 'SERVICE_FIELD_REQUIRED', `Complete ${field.label}.`);
        amountMinor = service.price_mode === 'FIXED' ? service.price_minor : 0;
        paymentStatus = service.payment_timing === 'AT_COUNTER' || service.price_mode === 'MERCHANT_QUOTE' ? PaymentStatus.PENDING : PaymentStatus.PENDING;
      } else throw new HttpError(400, 'REQUEST_TYPE_UNAVAILABLE', 'This request type is not available in the current customer flow.');
      const requestId = id(); const timestamp = now();
      const initialState = amountMinor > 0 && paymentTiming !== 'AT_COUNTER' ? RequestState.AWAITING_PAYMENT : RequestState.SUBMITTED;
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO requests (id, request_number, shop_id, customer_session_id, type, state, amount_minor, currency, payment_status, service_definition_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(requestId, nextRequestNumber(), shop.id, req.customerSession.id, type, initialState, amountMinor, shop.currency, paymentStatus, service?.id ?? null, timestamp, timestamp);
        if (printDetails) db.prepare('INSERT INTO print_request_details (request_id, page_range, selected_page_count, copies, color_mode, paper_size, sides, orientation, scale_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(requestId, printDetails.pageRange, printDetails.selectedPageCount, printDetails.copies, printDetails.colorMode, printDetails.paperSize, printDetails.sides, printDetails.orientation, printDetails.scaleMode);
        if (service) db.prepare('INSERT INTO service_request_details (request_id, field_values_json, customer_note) VALUES (?, ?, ?)').run(requestId, JSON.stringify(fieldValues), String(customerNote).slice(0, 1000));
        if (attachmentIds.length) db.prepare(`UPDATE request_attachments SET request_id = ? WHERE id IN (${placeholders})`).run(requestId, ...attachmentIds);
        event({ requestId, eventType: 'REQUEST_CREATED', nextState: initialState, actorType: 'CUSTOMER', actorId: req.customerSession.id });
        audit({ requestId, actorType: 'CUSTOMER', actorId: req.customerSession.id, action: 'REQUEST_CREATED', correlationId: req.correlationId, metadata: { type, shopId: shop.id, amountMinor } });
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
      if (initialState === RequestState.SUBMITTED) broadcastRequest(created);
      return { status: 201, body: { request: responseRequest(created, true) } };
    });
    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) { next(error); }
});

app.post('/v1/customer/requests/:requestId/pay-development', customerAuth, (req, res, next) => {
  try {
    if (!developmentPayments) throw new HttpError(403, 'DEVELOPMENT_PAYMENTS_DISABLED', 'The development payment provider is disabled.');
    const result = rememberIdempotent(`customer:${req.customerSession.id}:payment:${req.params.requestId}`, req.header('x-idempotency-key'), () => {
      const request = db.prepare('SELECT * FROM requests WHERE id = ? AND customer_session_id = ?').get(req.params.requestId, req.customerSession.id);
      if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
      if (request.state !== RequestState.AWAITING_PAYMENT) throw new HttpError(409, 'PAYMENT_NOT_EXPECTED', 'This request is not awaiting payment.');
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO payments (id, request_id, provider, provider_reference, status, amount_minor, currency, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id(), request.id, 'DEVELOPMENT_ONLY', `dev_${id()}`, PaymentStatus.PAID, request.amount_minor, request.currency, now(), now());
        db.prepare('UPDATE requests SET payment_status = ? WHERE id = ?').run(PaymentStatus.PAID, request.id);
        const paid = transitionRequest({ ...request, payment_status: PaymentStatus.PAID }, RequestState.PAID, 'PAYMENT_PROVIDER', 'development', req.correlationId, { development: true });
        const submitted = transitionRequest(paid, RequestState.SUBMITTED, 'CUSTOMER', req.customerSession.id, req.correlationId);
        db.exec('COMMIT');
        return { status: 200, body: { request: responseRequest(submitted, true) } };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) { next(error); }
});

app.get('/v1/customer/requests', customerAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM requests WHERE customer_session_id = ? ORDER BY created_at DESC LIMIT 30').all(req.customerSession.id);
  res.json({ requests: rows.map((row) => responseRequest(row, true)) });
});
app.get('/v1/customer/requests/:requestId', customerAuth, (req, res, next) => {
  try { const request = db.prepare('SELECT * FROM requests WHERE id = ? AND customer_session_id = ?').get(req.params.requestId, req.customerSession.id); if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.'); res.json({ request: responseRequest(request, true) }); } catch (error) { next(error); }
});

app.get('/v1/realtime/ticket', (req, res, next) => {
  try {
    const sessionToken = req.header('x-sprint-session'); const deviceToken = req.header('x-sprint-device');
    const principal = sessionToken ? { kind: 'customer', sessionId: getSession(sessionToken).id } : deviceToken ? { kind: 'device', shopId: getDevice(deviceToken).shop_id } : null;
    if (!principal) throw new HttpError(401, 'REALTIME_AUTH_REQUIRED', 'Sign in before connecting to live updates.');
    res.json({ ticket: issueTicket(principal), expiresInSeconds: 60 });
  } catch (error) { next(error); }
});

app.post('/v1/merchant/devices/register', (req, res, next) => {
  try {
    if (isProduction || req.header('x-merchant-setup-key') !== setupKey) throw new HttpError(403, 'SETUP_NOT_AUTHORIZED', 'Use the authenticated merchant onboarding flow to register a device.');
    const shop = shopBySlug(req.body.shopSlug);
    const deviceToken = token(); const deviceId = id();
    db.prepare('INSERT INTO merchant_devices (id, shop_id, name, token_hash, version, status, created_at, last_seen_at, capabilities_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(deviceId, shop.id, String(req.body.name || 'Sprint Merchant').slice(0, 80), hash(deviceToken), String(req.body.version || '0.1.0'), 'ACTIVE', now(), now(), JSON.stringify(req.body.capabilities || {}));
    audit({ actorType: 'MERCHANT_DEVICE', actorId: deviceId, action: 'DEVICE_REGISTERED', correlationId: req.correlationId, metadata: { shopId: shop.id } });
    res.status(201).json({ deviceId, deviceToken, shop: { slug: shop.slug, displayName: shop.display_name } });
  } catch (error) { next(error); }
});

app.get('/v1/merchant/requests', deviceAuth, (req, res) => {
  const states = String(req.query.states || 'SUBMITTED,ACCEPTED,PROCESSING,CUSTOMER_ACTION_REQUIRED,READY').split(',').filter(Boolean);
  const placeholders = states.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM requests WHERE shop_id = ? AND state IN (${placeholders}) ORDER BY created_at ASC`).all(req.device.shop_id, ...states);
  res.json({ requests: rows.map((row) => responseRequest(row, true)) });
});

app.post('/v1/merchant/requests/:requestId/transition', deviceAuth, (req, res, next) => {
  try {
    const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
    const nextState = String(req.body.state || '');
    if (![RequestState.ACCEPTED, RequestState.PROCESSING, RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.READY, RequestState.COMPLETED, RequestState.REJECTED].includes(nextState)) throw new HttpError(400, 'STATE_NOT_ALLOWED', 'This merchant action is not supported.');
    const updated = transitionRequest(request, nextState, 'MERCHANT_DEVICE', req.device.id, req.correlationId, { note: String(req.body.note || '').slice(0, 500) });
    if (nextState === RequestState.READY && request.type === RequestType.PRINT) {
      db.prepare("UPDATE print_executions SET state = 'COMPLETED', completed_at = ? WHERE id = (SELECT id FROM print_executions WHERE request_id = ? AND device_id = ? AND state = 'SUBMITTED' ORDER BY submitted_at DESC LIMIT 1)").run(now(), request.id, req.device.id);
    }
    res.json({ request: responseRequest(updated, true) });
  } catch (error) { next(error); }
});

app.post('/v1/merchant/requests/:requestId/print-executions', deviceAuth, (req, res, next) => {
  try {
    const result = rememberIdempotent(`device:${req.device.id}:print:${req.params.requestId}`, req.header('x-idempotency-key'), () => {
      const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
      if (request.type !== RequestType.PRINT || request.state !== RequestState.ACCEPTED) throw new HttpError(409, 'PRINT_NOT_READY', 'Accept this print request before printing it.');
      const printerId = String(req.body.printerId || '').slice(0, 200);
      if (!printerId) throw new HttpError(400, 'PRINTER_REQUIRED', 'Choose a configured printer.');
      const executionId = id();
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO print_executions (id, request_id, device_id, printer_id, state, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(executionId, request.id, req.device.id, printerId, 'PENDING', `execution:${executionId}`, now());
        const updated = transitionRequest(request, RequestState.PROCESSING, 'MERCHANT_DEVICE', req.device.id, req.correlationId, { printExecutionId: executionId, printerId });
        db.exec('COMMIT');
        return { status: 201, body: { execution: { id: executionId, state: 'PENDING' }, request: responseRequest(updated, true) } };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) { next(error); }
});

app.post('/v1/merchant/print-executions/:executionId', deviceAuth, (req, res, next) => {
  try {
    const execution = db.prepare('SELECT e.*, r.shop_id, r.state AS request_state, r.customer_session_id FROM print_executions e JOIN requests r ON r.id = e.request_id WHERE e.id = ? AND e.device_id = ? AND r.shop_id = ?').get(req.params.executionId, req.device.id, req.device.shop_id);
    if (!execution) throw new HttpError(404, 'PRINT_EXECUTION_NOT_FOUND', 'Print execution not found.');
    const state = String(req.body.state || '');
    if (!['DOWNLOADING', 'SUBMITTED', 'COMPLETED', 'FAILED', 'ATTENTION_REQUIRED', 'CANCELLED'].includes(state)) throw new HttpError(400, 'PRINT_STATE_INVALID', 'Invalid print execution state.');
    if (['COMPLETED', 'FAILED', 'ATTENTION_REQUIRED', 'CANCELLED'].includes(execution.state)) throw new HttpError(409, 'PRINT_EXECUTION_FINAL', 'This print execution is already final and will not be submitted again.');
    const stamp = now();
    db.prepare('UPDATE print_executions SET state = ?, spooler_job_id = COALESCE(?, spooler_job_id), detail = ?, submitted_at = CASE WHEN ? = \'SUBMITTED\' THEN ? ELSE submitted_at END, completed_at = CASE WHEN ? IN (\'COMPLETED\',\'FAILED\',\'ATTENTION_REQUIRED\',\'CANCELLED\') THEN ? ELSE completed_at END WHERE id = ?')
      .run(state, req.body.spoolerJobId ? String(req.body.spoolerJobId).slice(0, 120) : null, String(req.body.detail || '').slice(0, 500), state, stamp, state, stamp, execution.id);
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(execution.request_id);
    let updated = request;
    if (state === 'COMPLETED' && request.state === RequestState.PROCESSING) updated = transitionRequest(request, RequestState.READY, 'MERCHANT_DEVICE', req.device.id, req.correlationId, { printExecutionId: execution.id });
    if (state === 'FAILED' && request.state === RequestState.PROCESSING) updated = transitionRequest(request, RequestState.FAILED, 'MERCHANT_DEVICE', req.device.id, req.correlationId, { printExecutionId: execution.id });
    audit({ requestId: request.id, actorType: 'MERCHANT_DEVICE', actorId: req.device.id, action: `PRINT_${state}`, correlationId: req.correlationId, metadata: { printExecutionId: execution.id, spoolerJobId: req.body.spoolerJobId ?? null } });
    res.json({ execution: { id: execution.id, state }, request: responseRequest(updated, true) });
  } catch (error) { next(error); }
});

app.get('/v1/merchant/attachments/:attachmentId/download', deviceAuth, (req, res, next) => {
  try {
    const attachment = db.prepare('SELECT a.* FROM request_attachments a JOIN requests r ON r.id = a.request_id WHERE a.id = ? AND r.shop_id = ? AND a.deleted_at IS NULL AND a.expires_at > ?').get(req.params.attachmentId, req.device.shop_id, now());
    if (!attachment) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND', 'The attachment is unavailable or has expired.');
    const filePath = resolve(storageDirectory, attachment.object_key);
    if (!filePath.startsWith(resolve(storageDirectory))) throw new HttpError(500, 'ATTACHMENT_PATH_INVALID', 'Attachment storage is misconfigured.');
    const file = readFileSync(filePath);
    res.set({ 'Content-Type': attachment.mime_type, 'Content-Disposition': `attachment; filename="${safeName(attachment.original_name)}"`, 'Cache-Control': 'private, no-store' }).send(file);
    audit({ requestId: attachment.request_id, actorType: 'MERCHANT_DEVICE', actorId: req.device.id, action: 'ATTACHMENT_DOWNLOADED', correlationId: req.correlationId, metadata: { attachmentId: attachment.id } });
  } catch (error) { next(error); }
});

app.get('/v1/admin/overview', (req, res, next) => {
  try {
    if (!process.env.SPRINT_ADMIN_TOKEN || req.header('x-admin-token') !== process.env.SPRINT_ADMIN_TOKEN) throw new HttpError(401, 'ADMIN_REQUIRED', 'Administrator authorization is required.');
    const shops = db.prepare('SELECT id, slug, display_name, status, updated_at FROM shops ORDER BY display_name').all();
    const requests = db.prepare('SELECT state, COUNT(*) AS count FROM requests GROUP BY state').all();
    const devices = db.prepare('SELECT d.id, d.name, d.version, d.status, d.last_seen_at, s.display_name AS shop_name FROM merchant_devices d JOIN shops s ON s.id = d.shop_id ORDER BY d.last_seen_at DESC').all();
    res.json({ shops, requestCounts: requests, devices });
  } catch (error) { next(error); }
});

app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) error = new HttpError(413, 'UPLOAD_TOO_LARGE', `Files must be ${Math.floor(uploadLimit / 1024 / 1024)} MB or smaller.`);
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  log(status >= 500 ? 'error' : 'warn', 'api.error', { correlationId: req.correlationId, status, code, message: error.message });
  res.status(status).json({ error: { code, message: status >= 500 ? 'Sprint could not complete that action. Please try again.' : error.message, details: error instanceof HttpError ? error.details : undefined }, requestId: req.correlationId });
});

const server = createServer(app);
const webSocketServer = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname !== '/v1/realtime') return socket.destroy();
  const ticket = url.searchParams.get('ticket'); const record = ticket && tickets.get(ticket);
  if (!record || record.expiresAt < Date.now()) return socket.destroy();
  tickets.delete(ticket);
  webSocketServer.handleUpgrade(request, socket, head, (websocket) => { websocket.principal = record.principal; webSocketServer.emit('connection', websocket); });
});
webSocketServer.on('connection', (websocket) => { connections.add(websocket); websocket.send(JSON.stringify({ type: 'connected', at: now() })); websocket.on('close', () => connections.delete(websocket)); });

export { app, db, server, storageDirectory };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  server.listen(port, () => log('info', 'api.started', { port, environment: process.env.NODE_ENV || 'development', developmentPayments }));
}
