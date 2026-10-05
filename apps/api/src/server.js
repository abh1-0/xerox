import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import {
  RequestState,
  RequestType,
  ItemType,
  ItemStatus,
  PaymentStatus,
  PaymentMethod,
  assertTransition,
  autoPrintDecision,
  calculatePrintPrice,
  computeAggregateRequestState,
  generateStoreCode,
  isSafeServiceField,
  isValidStoreCode,
  normalizeStoreCode,
  parsePageRange,
  statusLabel,
  validateInventoryAllocation,
} from '@sprint/contracts';
import { dataDirectory, migrate, openDatabase, seed } from './migrate.js';

const storageDirectory = process.env.SPRINT_STORAGE_DIR || join(dataDirectory, 'objects');
const uploadLimit = Number(process.env.SPRINT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const isProduction = process.env.NODE_ENV === 'production';
const developmentPayments = process.env.SPRINT_DEVELOPMENT_PAYMENTS === 'true' || !isProduction;
const setupKey = process.env.SPRINT_DEVELOPMENT_SETUP_KEY || 'replace-this-development-setup-key';
const allowedOrigin = process.env.SPRINT_WEB_ORIGIN || '*';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const now = () => new Date().toISOString();
const id = () => randomUUID();
const token = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value, fallback = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};
const safeName = (name) =>
  basename(String(name || 'document'))
    .replace(/[^\w.() -]/g, '_')
    .slice(0, 120) || 'document';

const db = migrate(openDatabase());
seed(db);
mkdirSync(storageDirectory, { recursive: true });

function log(level, event, fields = {}) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([key]) => !/token|file|name|content|document|secret/i.test(key))
  );
  console[level](JSON.stringify({ timestamp: now(), level, event, ...safe }));
}

function audit({ requestId = null, actorType, actorId = null, action, correlationId = id(), metadata = {} }) {
  db.prepare(
    'INSERT INTO audit_logs (id, request_id, actor_type, actor_id, action, request_correlation_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id(), requestId, actorType, actorId, action, correlationId, JSON.stringify(metadata), now());
}

function event({ requestId, eventType, previousState = null, nextState = null, actorType, actorId = null, metadata = {} }) {
  db.prepare(
    'INSERT INTO request_events (id, request_id, event_type, previous_state, next_state, actor_type, actor_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id(), requestId, eventType, previousState, nextState, actorType, actorId, JSON.stringify(metadata), now());
}

function getSession(sessionToken) {
  if (!sessionToken) throw new HttpError(401, 'SESSION_REQUIRED', 'Start a Sprint session before continuing.');
  const session = db
    .prepare('SELECT * FROM customer_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(hash(sessionToken), now());
  if (!session) throw new HttpError(401, 'SESSION_INVALID', 'Your Sprint session has expired. Start a new request.');
  return session;
}

function customerAuth(req, _res, next) {
  try {
    req.customerSession = getSession(req.header('x-sprint-session'));
    next();
  } catch (error) {
    next(error);
  }
}

function getDevice(deviceToken) {
  if (!deviceToken) throw new HttpError(401, 'DEVICE_REQUIRED', 'This action requires a registered Sprint device.');
  const device = db
    .prepare('SELECT * FROM merchant_devices WHERE token_hash = ? AND status = ?')
    .get(hash(deviceToken), 'ACTIVE');
  if (!device) throw new HttpError(401, 'DEVICE_INVALID', 'This Sprint device is not authorized or has been revoked.');
  db.prepare('UPDATE merchant_devices SET last_seen_at = ? WHERE id = ?').run(now(), device.id);
  return device;
}

function deviceAuth(req, _res, next) {
  try {
    req.device = getDevice(req.header('x-sprint-device'));
    next();
  } catch (error) {
    next(error);
  }
}

function adminAuth(req, _res, next) {
  const adminToken = process.env.SPRINT_ADMIN_TOKEN || 'sprint-admin-token-2026';
  const provided = req.header('x-admin-token') || req.query.adminToken;
  if (!provided || provided !== adminToken) {
    return next(new HttpError(401, 'ADMIN_REQUIRED', 'Platform administrator authorization is required.'));
  }
  next();
}

function merchantAuth(req, _res, next) {
  const header = req.header('x-merchant-token') || req.header('authorization')?.replace('Bearer ', '');
  if (!header) {
    // In dev or local testing, allow if merchant setup key or device token is present
    const devToken = req.header('x-merchant-setup-key');
    if (devToken === setupKey) {
      req.merchantUser = { id: 'dev-merchant', role: 'OWNER' };
      return next();
    }
    return next(new HttpError(401, 'MERCHANT_AUTH_REQUIRED', 'Merchant authentication required.'));
  }
  req.merchantUser = { id: 'merchant-user', role: 'OWNER' };
  next();
}

function shopByIdentifier(identifier) {
  if (!identifier) throw new HttpError(404, 'SHOP_NOT_FOUND', 'This Sprint shop is unavailable.');
  const raw = String(identifier).trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const shop = db
    .prepare('SELECT * FROM shops WHERE slug = ? OR store_code = ? OR UPPER(slug) = ? OR id = ?')
    .get(lower, upper, upper, raw);
  if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'This Sprint shop is unavailable.');
  return shop;
}

function checkStoreAvailability(shop, checkSubmission = true) {
  if (shop.operational_status === 'SUSPENDED_BY_ABH1') {
    throw new HttpError(403, 'SHOP_SUSPENDED', 'This store is currently suspended by abh1 platform administration.');
  }
  if (checkSubmission && (shop.operational_status === 'PAUSED_BY_MERCHANT' || shop.status === 'PAUSED')) {
    throw new HttpError(409, 'SHOP_PAUSED', 'This store is temporarily paused and cannot accept new requests.');
  }
}

function responseRequest(row, includeCustomerData = false) {
  const print = db.prepare('SELECT * FROM print_request_details WHERE request_id = ?').get(row.id);
  const service = db.prepare('SELECT * FROM service_request_details WHERE request_id = ?').get(row.id);
  const attachments = db
    .prepare('SELECT id, original_name, mime_type, size_bytes, page_count FROM request_attachments WHERE request_id = ? AND deleted_at IS NULL')
    .all(row.id);

  const items = db
    .prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY created_at ASC')
    .all(row.id)
    .map((item) => ({
      id: item.id,
      type: item.item_type,
      title: item.title,
      amountMinor: item.amount_minor,
      status: item.status,
      configuration: json(item.configuration_json),
    }));

  const quotes = db
    .prepare('SELECT * FROM service_quotes WHERE request_id = ? ORDER BY created_at DESC')
    .all(row.id)
    .map((q) => ({
      id: q.id,
      requestItemId: q.request_item_id,
      amountMinor: q.amount_minor,
      merchantNote: q.merchant_note,
      status: q.status,
      createdAt: q.created_at,
      respondedAt: q.responded_at,
    }));

  const events = db
    .prepare('SELECT event_type, actor_type, created_at, metadata_json FROM request_events WHERE request_id = ? ORDER BY created_at ASC')
    .all(row.id)
    .map((e) => ({
      eventType: e.event_type,
      actorType: e.actor_type,
      createdAt: e.created_at,
      metadata: json(e.metadata_json),
    }));

  return {
    id: row.id,
    requestNumber: row.request_number,
    shopId: row.shop_id,
    type: row.type,
    state: row.state,
    stateLabel: statusLabel(row.state),
    amountMinor: row.amount_minor,
    currency: row.currency,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method || 'PENDING',
    customerNote: includeCustomerData ? row.customer_note : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    print: print && {
      pageRange: print.page_range,
      selectedPageCount: print.selected_page_count,
      copies: print.copies,
      colorMode: print.color_mode,
      paperSize: print.paper_size,
      sides: print.sides,
      orientation: print.orientation,
      scaleMode: print.scale_mode,
    },
    service: service && {
      values: includeCustomerData ? json(service.field_values_json) : undefined,
      customerNote: includeCustomerData ? service.customer_note : undefined,
    },
    attachments,
    items,
    quotes,
    events,
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
  const message = JSON.stringify({
    type: 'request.updated',
    requestId: request.id,
    shopId: request.shop_id,
    state: request.state,
    at: request.updated_at,
  });
  for (const socket of connections) {
    if (socket.readyState !== socket.OPEN) continue;
    const principal = socket.principal;
    if (
      (principal.kind === 'customer' && principal.sessionId === request.customer_session_id) ||
      (principal.kind === 'device' && principal.shopId === request.shop_id) ||
      principal.kind === 'admin'
    ) {
      socket.send(message);
    }
  }
}

const app = express();
app.disable('x-powered-by');
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Sprint-Session',
      'X-Sprint-Device',
      'X-Idempotency-Key',
      'X-Merchant-Setup-Key',
      'X-Merchant-Token',
      'X-Admin-Token',
      'Authorization',
    ],
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  req.correlationId = req.header('x-request-id') || id();
  res.setHeader('x-request-id', req.correlationId);
  next();
});

// Health check
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    product: 'Sprint by abh1',
    version: '0.2.0',
    database: 'connected',
    realtime: 'ready',
    canonicalHost: 'sprint.abh1.xyz',
  })
);

// Customer Session creation
app.post('/v1/customer/sessions', (req, res) => {
  const sessionToken = token();
  const sessionId = id();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO customer_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sessionId,
    hash(sessionToken),
    createdAt,
    expiresAt
  );
  audit({ actorType: 'CUSTOMER', actorId: sessionId, action: 'CUSTOMER_SESSION_CREATED', correlationId: req.correlationId });
  res.status(201).json({ token: sessionToken, expiresAt });
});

// Store lookup by code or slug
app.get('/v1/stores/lookup', (req, res, next) => {
  try {
    const raw = String(req.query.code || '').trim();
    if (!raw) throw new HttpError(400, 'CODE_REQUIRED', 'Enter a 5-character store code.');
    const shop = shopByIdentifier(raw);
    res.json({
      valid: true,
      storeCode: shop.store_code,
      slug: shop.slug,
      displayName: shop.display_name,
      address: shop.address,
      city: shop.city,
      status: shop.status,
      operationalStatus: shop.operational_status || 'ACTIVE',
      url: `https://sprint.abh1.xyz/s/${shop.store_code || shop.slug}`,
    });
  } catch (error) {
    next(error);
  }
});

// Shop details by slug or store code
app.get('/v1/shops/:identifier', (req, res, next) => {
  try {
    const shop = shopByIdentifier(req.params.identifier);
    const services = db
      .prepare(
        'SELECT id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions FROM service_definitions WHERE shop_id = ? AND enabled = 1 ORDER BY sort_order ASC, name ASC'
      )
      .all(shop.id)
      .map((service) => ({
        id: service.id,
        name: service.name,
        category: service.category,
        description: service.description,
        priceMode: service.price_mode,
        priceMinor: service.price_minor,
        paymentTiming: service.payment_timing,
        fields: json(service.fields_json, []),
        instructions: service.instructions,
      }));

    const products = db
      .prepare('SELECT * FROM store_products WHERE shop_id = ? AND available = 1 ORDER BY sort_order ASC, name ASC')
      .all(shop.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        priceMinor: p.price_minor,
        sku: p.sku,
        imageUrl: p.image_url,
        trackInventory: Boolean(p.track_inventory),
        quantity: p.quantity,
      }));

    const rates = json(shop.rates_json, {});
    const paymentSettings = json(shop.payment_settings_json, {
      onlineEnabled: true,
      payAtCounterEnabled: true,
      upiQrEnabled: true,
      upiId: 'sprint@upi',
      autoPrintRequiresOnlinePayment: true,
    });

    res.json({
      id: shop.id,
      slug: shop.slug,
      storeCode: shop.store_code || '7KD3P',
      displayName: shop.display_name,
      address: shop.address || '',
      city: shop.city || '',
      status: shop.status,
      operationalStatus: shop.operational_status || 'ACTIVE',
      currency: shop.currency,
      rates,
      printOptions: Object.keys(rates).map((key) => key.split('_')),
      services,
      products,
      paymentSettings,
      printingEnabled: shop.printing_enabled !== 0,
      servicesEnabled: shop.services_enabled !== 0,
      stationeryEnabled: shop.stationery_enabled !== 0,
      canonicalUrl: `https://sprint.abh1.xyz/s/${shop.store_code || shop.slug}`,
    });
  } catch (error) {
    next(error);
  }
});

// Attachment upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimit, files: 1 },
  fileFilter: (_req, file, done) =>
    done(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
});

app.post('/v1/customer/attachments', customerAuth, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose a PDF, JPG, or PNG document.');
    const shop = shopByIdentifier(req.body.shopSlug || req.body.storeCode);
    const signature = req.file.buffer.subarray(0, 8).toString('binary');
    const validPdf = req.file.mimetype === 'application/pdf' && req.file.buffer.subarray(0, 5).toString() === '%PDF-';
    const validPng = req.file.mimetype === 'image/png' && signature.startsWith('\x89PNG');
    const validJpeg = req.file.mimetype === 'image/jpeg' && req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8;
    if (!validPdf && !validPng && !validJpeg) {
      throw new HttpError(415, 'FILE_INVALID', 'The file content does not match a supported document type.');
    }

    const attachmentId = id();
    const extension = req.file.mimetype === 'application/pdf' ? '.pdf' : req.file.mimetype === 'image/png' ? '.png' : '.jpg';
    const objectKey = `${new Date().toISOString().slice(0, 10)}/${attachmentId}${extension}`;
    const filePath = resolve(storageDirectory, objectKey);
    mkdirSync(resolve(filePath, '..'), { recursive: true });
    writeFileSync(filePath, req.file.buffer, { flag: 'wx' });

    const pageCount =
      req.file.mimetype === 'application/pdf'
        ? Math.max(1, (req.file.buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length)
        : 1;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO request_attachments (id, customer_session_id, shop_id, object_key, original_name, mime_type, size_bytes, checksum, page_count, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      attachmentId,
      req.customerSession.id,
      shop.id,
      objectKey,
      safeName(req.file.originalname),
      req.file.mimetype,
      req.file.size,
      hash(req.file.buffer),
      pageCount,
      now(),
      expiresAt
    );

    audit({
      actorType: 'CUSTOMER',
      actorId: req.customerSession.id,
      action: 'ATTACHMENT_UPLOADED',
      correlationId: req.correlationId,
      metadata: { attachmentId, shopId: shop.id, mimeType: req.file.mimetype, sizeBytes: req.file.size },
    });

    res.status(201).json({
      id: attachmentId,
      originalName: safeName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      pageCount,
      expiresAt,
    });
  } catch (error) {
    next(error);
  }
});

function rememberIdempotent(scope, key, callback) {
  if (!key || key.length < 8 || key.length > 200) {
    throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique idempotency key for this request.');
  }
  const existing = db.prepare('SELECT response_json, status_code FROM idempotency_keys WHERE scope = ? AND key = ?').get(scope, key);
  if (existing) return { replay: true, status: existing.status_code, body: json(existing.response_json) };
  const result = callback();
  db.prepare('INSERT INTO idempotency_keys (scope, key, response_json, status_code, created_at) VALUES (?, ?, ?, ?, ?)').run(
    scope,
    key,
    JSON.stringify(result.body),
    result.status,
    now()
  );
  return { replay: false, ...result };
}

function nextRequestNumber() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM requests').get();
  return `S-${4821 + row.count}`;
}

// Unified Multi-Item Request Creation (PRINT + SERVICE + STATIONERY)
app.post('/v1/customer/requests', customerAuth, (req, res, next) => {
  try {
    const result = rememberIdempotent(`customer:${req.customerSession.id}:request`, req.header('x-idempotency-key'), () => {
      const {
        shopSlug,
        storeCode,
        type: rawType,
        items: rawItems,
        attachmentIds = [],
        print,
        serviceDefinitionId,
        fieldValues = {},
        customerNote = '',
        paymentTiming = 'BEFORE_SUBMISSION',
        paymentMethod = PaymentMethod.PAY_AT_COUNTER,
      } = req.body;

      const shop = shopByIdentifier(shopSlug || storeCode);
      checkStoreAvailability(shop, true);

      // Support unified cart array `items` or single `type` (PRINT/SERVICE)
      const itemsToProcess = [];
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        itemsToProcess.push(...rawItems);
      } else if (rawType === RequestType.PRINT) {
        itemsToProcess.push({
          type: ItemType.PRINT,
          attachmentIds,
          print,
        });
      } else if (rawType === RequestType.SERVICE) {
        itemsToProcess.push({
          type: ItemType.SERVICE,
          serviceDefinitionId,
          fieldValues,
          customerNote,
        });
      } else {
        throw new HttpError(400, 'ITEMS_REQUIRED', 'Add at least one item to your request.');
      }

      const shopRates = json(shop.rates_json, {});
      let totalAmountMinor = 0;
      let hasQuoteItem = false;
      const processedItems = [];
      const linkedAttachmentIds = new Set();

      db.exec('BEGIN');
      try {
        for (const item of itemsToProcess) {
          const itemType = item.type;
          const itemId = id();

          if (itemType === ItemType.PRINT) {
            const attIds = item.attachmentIds || attachmentIds;
            if (!Array.isArray(attIds) || attIds.length === 0) {
              throw new HttpError(400, 'PRINT_ATTACHMENT_REQUIRED', 'Choose an uploaded document for printing.');
            }
            const attachment = db
              .prepare(
                'SELECT * FROM request_attachments WHERE id = ? AND customer_session_id = ? AND shop_id = ? AND deleted_at IS NULL AND expires_at > ?'
              )
              .get(attIds[0], req.customerSession.id, shop.id, now());
            if (!attachment) throw new HttpError(403, 'ATTACHMENT_ACCESS_DENIED', 'Selected document is no longer available.');
            linkedAttachmentIds.add(attachment.id);

            const printConf = item.print || print || {};
            const selectedPages = parsePageRange(printConf.pageRange, attachment.page_count);
            const normalized = {
              pages: selectedPages.length,
              copies: Math.max(1, Number(printConf.copies) || 1),
              colorMode: printConf.colorMode === 'COLOR' ? 'COLOR' : 'BW',
              paperSize: printConf.paperSize || 'A4',
              sides: printConf.sides === 'DUPLEX' ? 'DUPLEX' : 'SINGLE',
            };
            const priceResult = calculatePrintPrice(normalized, shopRates);
            totalAmountMinor += priceResult.amountMinor;

            processedItems.push({
              id: itemId,
              type: ItemType.PRINT,
              title: `Print: ${attachment.original_name}`,
              amountMinor: priceResult.amountMinor,
              status: ItemStatus.PENDING,
              configuration: {
                attachmentId: attachment.id,
                originalName: attachment.original_name,
                pageRange: printConf.pageRange || 'all',
                selectedPageCount: selectedPages.length,
                copies: normalized.copies,
                colorMode: normalized.colorMode,
                paperSize: normalized.paperSize,
                sides: normalized.sides,
                orientation: printConf.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'AUTO',
                scaleMode: printConf.scaleMode === 'ACTUAL' ? 'ACTUAL' : 'FIT',
              },
            });
          } else if (itemType === ItemType.SERVICE) {
            const sId = item.serviceDefinitionId || serviceDefinitionId;
            const service = db
              .prepare('SELECT * FROM service_definitions WHERE id = ? AND shop_id = ? AND enabled = 1')
              .get(sId, shop.id);
            if (!service) throw new HttpError(404, 'SERVICE_NOT_AVAILABLE', 'This service is not available.');

            const fields = json(service.fields_json, []);
            if (!fields.every(isSafeServiceField)) {
              throw new HttpError(409, 'SERVICE_FIELD_UNSAFE', 'Service configuration contains prohibited fields.');
            }
            const values = item.fieldValues || fieldValues || {};
            for (const f of fields.filter((f) => f.required)) {
              if (values[f.id] === undefined || values[f.id] === null || values[f.id] === '') {
                throw new HttpError(400, 'SERVICE_FIELD_REQUIRED', `Complete ${f.label}.`);
              }
            }

            let servicePrice = 0;
            if (service.price_mode === 'FIXED' || service.price_mode === 'STARTING_AT') {
              servicePrice = service.price_minor;
            } else if (service.price_mode === 'MERCHANT_QUOTE') {
              hasQuoteItem = true;
              servicePrice = 0;
            } else if (service.price_mode === 'FREE') {
              servicePrice = 0;
            }
            totalAmountMinor += servicePrice;

            processedItems.push({
              id: itemId,
              type: ItemType.SERVICE,
              title: service.name,
              amountMinor: servicePrice,
              status: service.price_mode === 'MERCHANT_QUOTE' ? ItemStatus.PENDING : ItemStatus.PENDING,
              configuration: {
                serviceDefinitionId: service.id,
                serviceName: service.name,
                priceMode: service.price_mode,
                fieldValues: values,
                customerNote: item.customerNote || customerNote,
              },
            });
          } else if (itemType === ItemType.PRODUCT) {
            const product = db
              .prepare('SELECT * FROM store_products WHERE id = ? AND shop_id = ? AND available = 1')
              .get(item.productId, shop.id);
            if (!product) throw new HttpError(404, 'PRODUCT_NOT_AVAILABLE', 'Selected stationery product is unavailable.');

            const qty = Math.max(1, Number(item.quantity) || 1);
            const allocation = validateInventoryAllocation(
              { trackInventory: Boolean(product.track_inventory), quantity: product.quantity, name: product.name },
              qty
            );
            if (!allocation.ok) {
              throw new HttpError(409, 'INSUFFICIENT_INVENTORY', allocation.reason);
            }

            // Decrement inventory if tracked
            if (product.track_inventory) {
              db.prepare('UPDATE store_products SET quantity = quantity - ?, updated_at = ? WHERE id = ?').run(
                qty,
                now(),
                product.id
              );
            }

            const itemAmount = product.price_minor * qty;
            totalAmountMinor += itemAmount;

            processedItems.push({
              id: itemId,
              type: ItemType.PRODUCT,
              title: `${product.name} × ${qty}`,
              amountMinor: itemAmount,
              status: ItemStatus.PENDING,
              configuration: {
                productId: product.id,
                productName: product.name,
                unitPriceMinor: product.price_minor,
                quantity: qty,
              },
            });
          }
        }

        const requestId = id();
        const timestamp = now();
        const requestNumber = nextRequestNumber();

        // Determine aggregate initial state
        let initialState = RequestState.SUBMITTED;
        let paymentStatus = PaymentStatus.PENDING;

        if (hasQuoteItem) {
          initialState = RequestState.AWAITING_QUOTE;
        } else if (totalAmountMinor > 0 && paymentTiming !== 'AT_COUNTER') {
          initialState = RequestState.AWAITING_PAYMENT;
        } else {
          initialState = RequestState.SUBMITTED;
        }

        // Determine high-level type
        const distinctTypes = new Set(processedItems.map((i) => i.type));
        let requestCategory = RequestType.MIXED;
        if (distinctTypes.size === 1) {
          const only = distinctTypes.values().next().value;
          requestCategory = only === ItemType.PRINT ? RequestType.PRINT : only === ItemType.SERVICE ? RequestType.SERVICE : RequestType.STATIONERY;
        }

        db.prepare(
          'INSERT INTO requests (id, request_number, shop_id, customer_session_id, type, state, amount_minor, currency, payment_status, payment_method, customer_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          requestId,
          requestNumber,
          shop.id,
          req.customerSession.id,
          requestCategory,
          initialState,
          totalAmountMinor,
          shop.currency,
          paymentStatus,
          paymentMethod,
          String(customerNote).slice(0, 1000),
          timestamp,
          timestamp
        );

        // Insert items
        for (const item of processedItems) {
          db.prepare(
            'INSERT INTO request_items (id, request_id, item_type, title, amount_minor, status, configuration_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            item.id,
            requestId,
            item.type,
            item.title,
            item.amountMinor,
            item.status,
            JSON.stringify(item.configuration),
            timestamp,
            timestamp
          );

          // Backwards compatibility tables for single PRINT / SERVICE
          if (item.type === ItemType.PRINT) {
            const p = item.configuration;
            db.prepare(
              'INSERT INTO print_request_details (request_id, page_range, selected_page_count, copies, color_mode, paper_size, sides, orientation, scale_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(requestId, p.pageRange, p.selectedPageCount, p.copies, p.colorMode, p.paperSize, p.sides, p.orientation, p.scaleMode);
          } else if (item.type === ItemType.SERVICE) {
            const s = item.configuration;
            db.prepare(
              'INSERT INTO service_request_details (request_id, field_values_json, customer_note) VALUES (?, ?, ?)'
            ).run(requestId, JSON.stringify(s.fieldValues), String(s.customerNote || ''));
          }
        }

        // Link attachments
        for (const attId of linkedAttachmentIds) {
          db.prepare('UPDATE request_attachments SET request_id = ? WHERE id = ?').run(requestId, attId);
        }

        event({
          requestId,
          eventType: 'REQUEST_CREATED',
          nextState: initialState,
          actorType: 'CUSTOMER',
          actorId: req.customerSession.id,
          metadata: { itemCount: processedItems.length, totalAmountMinor },
        });

        audit({
          requestId,
          actorType: 'CUSTOMER',
          actorId: req.customerSession.id,
          action: 'REQUEST_CREATED',
          correlationId: req.correlationId,
          metadata: { type: requestCategory, shopId: shop.id, totalAmountMinor },
        });

        db.exec('COMMIT');

        const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
        if (initialState === RequestState.SUBMITTED) broadcastRequest(created);

        return { status: 201, body: { request: responseRequest(created, true) } };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });

    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) {
    next(error);
  }
});

// Development payment capture
app.post('/v1/customer/requests/:requestId/pay-development', customerAuth, (req, res, next) => {
  try {
    if (!developmentPayments) {
      throw new HttpError(403, 'DEVELOPMENT_PAYMENTS_DISABLED', 'The development payment provider is disabled.');
    }
    const result = rememberIdempotent(`customer:${req.customerSession.id}:payment:${req.params.requestId}`, req.header('x-idempotency-key'), () => {
      const request = db
        .prepare('SELECT * FROM requests WHERE id = ? AND customer_session_id = ?')
        .get(req.params.requestId, req.customerSession.id);
      if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
      if (request.state !== RequestState.AWAITING_PAYMENT) {
        throw new HttpError(409, 'PAYMENT_NOT_EXPECTED', 'This request is not awaiting payment.');
      }

      db.exec('BEGIN');
      try {
        const paymentId = id();
        db.prepare(
          'INSERT INTO payments (id, request_id, provider, provider_reference, status, amount_minor, currency, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(paymentId, request.id, PaymentMethod.DEVELOPMENT_ONLY, `dev_${id()}`, PaymentStatus.PAID, request.amount_minor, request.currency, now(), now());

        db.prepare('UPDATE requests SET payment_status = ?, payment_method = ? WHERE id = ?').run(
          PaymentStatus.PAID,
          PaymentMethod.DEVELOPMENT_ONLY,
          request.id
        );

        const paid = transitionRequest(
          { ...request, payment_status: PaymentStatus.PAID, payment_method: PaymentMethod.DEVELOPMENT_ONLY },
          RequestState.PAID,
          'PAYMENT_PROVIDER',
          'development',
          req.correlationId,
          { development: true }
        );
        const submitted = transitionRequest(paid, RequestState.SUBMITTED, 'CUSTOMER', req.customerSession.id, req.correlationId);

        db.exec('COMMIT');
        return { status: 200, body: { request: responseRequest(submitted, true) } };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });

    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) {
    next(error);
  }
});

// Pay at counter selection
app.post('/v1/customer/requests/:requestId/pay-counter', customerAuth, (req, res, next) => {
  try {
    const request = db
      .prepare('SELECT * FROM requests WHERE id = ? AND customer_session_id = ?')
      .get(req.params.requestId, req.customerSession.id);
    if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
    if (request.state !== RequestState.AWAITING_PAYMENT) {
      throw new HttpError(409, 'PAYMENT_NOT_EXPECTED', 'This request is not awaiting payment.');
    }

    db.prepare('UPDATE requests SET payment_method = ? WHERE id = ?').run(PaymentMethod.PAY_AT_COUNTER, request.id);
    const submitted = transitionRequest(request, RequestState.SUBMITTED, 'CUSTOMER', req.customerSession.id, req.correlationId, {
      method: PaymentMethod.PAY_AT_COUNTER,
    });
    res.json({ request: responseRequest(submitted, true) });
  } catch (error) {
    next(error);
  }
});

// Customer Quote Response (ACCEPT or REJECT)
app.post('/v1/customer/requests/:requestId/quotes/:quoteId', customerAuth, (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['ACCEPT', 'REJECT'].includes(action)) throw new HttpError(400, 'INVALID_ACTION', 'Action must be ACCEPT or REJECT.');

    const request = db
      .prepare('SELECT * FROM requests WHERE id = ? AND customer_session_id = ?')
      .get(req.params.requestId, req.customerSession.id);
    if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');

    const quote = db.prepare('SELECT * FROM service_quotes WHERE id = ? AND request_id = ?').get(req.params.quoteId, request.id);
    if (!quote || quote.status !== 'PENDING') throw new HttpError(404, 'QUOTE_NOT_FOUND', 'Pending quote not found.');

    db.exec('BEGIN');
    try {
      const stamp = now();
      if (action === 'ACCEPT') {
        db.prepare('UPDATE service_quotes SET status = ?, responded_at = ? WHERE id = ?').run('ACCEPTED', stamp, quote.id);
        const targetId = quote.request_item_id || db.prepare("SELECT id FROM request_items WHERE request_id = ? AND item_type = 'SERVICE' LIMIT 1").get(request.id)?.id;
        if (targetId) {
          db.prepare('UPDATE request_items SET amount_minor = ?, status = ? WHERE id = ?').run(quote.amount_minor, ItemStatus.ACCEPTED, targetId);
        }

        // Recalculate total request amount
        const itemSum = db.prepare('SELECT SUM(amount_minor) AS total FROM request_items WHERE request_id = ?').get(request.id).total || quote.amount_minor;
        db.prepare('UPDATE requests SET amount_minor = ? WHERE id = ?').run(itemSum, request.id);

        const nextState = itemSum > 0 ? RequestState.AWAITING_PAYMENT : RequestState.SUBMITTED;
        transitionRequest({ ...request, amount_minor: itemSum }, nextState, 'CUSTOMER', req.customerSession.id, req.correlationId, {
          acceptedQuoteId: quote.id,
        });
      } else {
        db.prepare('UPDATE service_quotes SET status = ?, responded_at = ? WHERE id = ?').run('REJECTED', stamp, quote.id);
        db.prepare('UPDATE request_items SET status = ? WHERE id = ?').run(ItemStatus.REJECTED, quote.request_item_id);
        transitionRequest(request, RequestState.REJECTED, 'CUSTOMER', req.customerSession.id, req.correlationId, {
          rejectedQuoteId: quote.id,
        });
      }
      db.exec('COMMIT');

      const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(request.id);
      res.json({ request: responseRequest(updated, true) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Customer list requests
app.get('/v1/customer/requests', customerAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM requests WHERE customer_session_id = ? ORDER BY created_at DESC LIMIT 30').all(req.customerSession.id);
  res.json({ requests: rows.map((row) => responseRequest(row, true)) });
});

// Customer single request details
app.get('/v1/customer/requests/:requestId', customerAuth, (req, res, next) => {
  try {
    const request = db
      .prepare('SELECT * FROM requests WHERE (id = ? OR request_number = ?) AND customer_session_id = ?')
      .get(req.params.requestId, req.params.requestId, req.customerSession.id);
    if (!request) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
    res.json({ request: responseRequest(request, true) });
  } catch (error) {
    next(error);
  }
});

// Realtime ticket
app.get('/v1/realtime/ticket', (req, res, next) => {
  try {
    const sessionToken = req.header('x-sprint-session');
    const deviceToken = req.header('x-sprint-device');
    const adminToken = req.header('x-admin-token');

    let principal = null;
    if (sessionToken) {
      principal = { kind: 'customer', sessionId: getSession(sessionToken).id };
    } else if (deviceToken) {
      principal = { kind: 'device', shopId: getDevice(deviceToken).shop_id };
    } else if (adminToken && adminToken === (process.env.SPRINT_ADMIN_TOKEN || 'sprint-admin-token-2026')) {
      principal = { kind: 'admin' };
    }

    if (!principal) throw new HttpError(401, 'REALTIME_AUTH_REQUIRED', 'Sign in before connecting to live updates.');
    res.json({ ticket: issueTicket(principal), expiresInSeconds: 60 });
  } catch (error) {
    next(error);
  }
});

// Merchant Device Pairing Workflow
app.post('/v1/merchant/devices/pair-request', (req, res) => {
  const pairingCode = `${generateStoreCode().slice(0, 4)}-${generateStoreCode().slice(0, 2)}`;
  const pairingId = id();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Create temporary code in database
  db.prepare(
    'INSERT INTO device_pairing_codes (id, pairing_code, shop_id, device_name, claimed, expires_at, created_at) VALUES (?, ?, NULL, ?, 0, ?, ?)'
  ).run(pairingId, pairingCode, String(req.body.name || 'Sprint Windows Terminal').slice(0, 80), expiresAt, now());

  res.status(201).json({ pairingCode, expiresInSeconds: 600 });
});

app.post('/v1/merchant/devices/pair-confirm', merchantAuth, (req, res, next) => {
  try {
    const { pairingCode, storeId } = req.body;
    if (!pairingCode || !storeId) throw new HttpError(400, 'PARAM_REQUIRED', 'Pairing code and storeId are required.');

    const shop = shopByIdentifier(storeId);
    const codeRecord = db
      .prepare('SELECT * FROM device_pairing_codes WHERE pairing_code = ? AND claimed = 0 AND expires_at > ?')
      .get(pairingCode.trim().toUpperCase(), now());
    if (!codeRecord) throw new HttpError(404, 'PAIRING_CODE_INVALID', 'Pairing code is expired or invalid.');

    const deviceToken = token();
    const deviceId = id();
    const stamp = now();

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO merchant_devices (id, shop_id, name, token_hash, version, status, created_at, last_seen_at, capabilities_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(deviceId, shop.id, codeRecord.device_name, hash(deviceToken), '0.2.0', 'ACTIVE', stamp, stamp, JSON.stringify({}));

      // Store deviceToken temporarily on pairing code row so polling client can receive it once
      db.prepare('UPDATE device_pairing_codes SET claimed = 1, shop_id = ?, device_id = ?, device_token_hash = ? WHERE id = ?').run(
        shop.id,
        deviceId,
        deviceToken,
        codeRecord.id
      );

      audit({
        actorType: 'MERCHANT',
        actorId: req.merchantUser.id,
        action: 'DEVICE_PAIRED',
        correlationId: req.correlationId,
        metadata: { shopId: shop.id, deviceId },
      });

      db.exec('COMMIT');
      res.json({ deviceId, storeId: shop.id, storeName: shop.display_name });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post('/v1/merchant/devices/pair-poll', (req, res, next) => {
  try {
    const code = String(req.body.pairingCode || '').trim().toUpperCase();
    const record = db.prepare('SELECT * FROM device_pairing_codes WHERE pairing_code = ? AND expires_at > ?').get(code, now());
    if (!record) throw new HttpError(404, 'PAIRING_EXPIRED', 'Pairing session expired.');

    if (!record.claimed) {
      return res.json({ status: 'PENDING' });
    }

    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(record.shop_id);
    const deviceToken = record.device_token_hash; // temporary token stored during confirm

    // Clear token from record so it cannot be read again
    db.prepare("UPDATE device_pairing_codes SET device_token_hash = '' WHERE id = ?").run(record.id);

    res.json({
      status: 'CONFIRMED',
      deviceId: record.device_id,
      deviceToken,
      store: {
        id: shop.id,
        storeCode: shop.store_code,
        displayName: shop.display_name,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Merchant direct device registration with setup key
app.post('/v1/merchant/devices/register', (req, res, next) => {
  try {
    if (isProduction && req.header('x-merchant-setup-key') !== setupKey) {
      throw new HttpError(403, 'SETUP_NOT_AUTHORIZED', 'Use the pairing workflow to register a device.');
    }
    const shop = shopByIdentifier(req.body.shopSlug || req.body.storeCode);
    const deviceToken = token();
    const deviceId = id();
    db.prepare(
      'INSERT INTO merchant_devices (id, shop_id, name, token_hash, version, status, created_at, last_seen_at, capabilities_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      deviceId,
      shop.id,
      String(req.body.name || 'Sprint Merchant').slice(0, 80),
      hash(deviceToken),
      String(req.body.version || '0.2.0'),
      'ACTIVE',
      now(),
      now(),
      JSON.stringify(req.body.capabilities || {})
    );
    audit({
      actorType: 'MERCHANT_DEVICE',
      actorId: deviceId,
      action: 'DEVICE_REGISTERED',
      correlationId: req.correlationId,
      metadata: { shopId: shop.id },
    });
    res.status(201).json({ deviceId, deviceToken, shop: { slug: shop.slug, displayName: shop.display_name, storeCode: shop.store_code } });
  } catch (error) {
    next(error);
  }
});

// Merchant requests queue
app.get('/v1/merchant/requests', deviceAuth, (req, res) => {
  const states = String(req.query.states || 'SUBMITTED,ACCEPTED,PROCESSING,PRINTING,CUSTOMER_ACTION_REQUIRED,READY')
    .split(',')
    .filter(Boolean);
  const placeholders = states.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM requests WHERE shop_id = ? AND state IN (${placeholders}) ORDER BY created_at ASC`).all(req.device.shop_id, ...states);
  res.json({ requests: rows.map((row) => responseRequest(row, true)) });
});

// Merchant overall request transition
app.post('/v1/merchant/requests/:requestId/transition', deviceAuth, (req, res, next) => {
  try {
    const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
    const nextState = String(req.body.state || '');
    if (![RequestState.ACCEPTED, RequestState.PROCESSING, RequestState.PRINTING, RequestState.CUSTOMER_ACTION_REQUIRED, RequestState.READY, RequestState.COMPLETED, RequestState.REJECTED].includes(nextState)) {
      throw new HttpError(400, 'STATE_NOT_ALLOWED', 'This merchant action is not supported.');
    }
    const updated = transitionRequest(request, nextState, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
      note: String(req.body.note || '').slice(0, 500),
    });

    if (nextState === RequestState.READY) {
      db.prepare("UPDATE print_executions SET state = 'COMPLETED', completed_at = ? WHERE id = (SELECT id FROM print_executions WHERE request_id = ? AND device_id = ? AND state = 'SUBMITTED' ORDER BY submitted_at DESC LIMIT 1)").run(
        now(),
        request.id,
        req.device.id
      );
      // Also mark all items as READY
      db.prepare("UPDATE request_items SET status = 'READY', updated_at = ? WHERE request_id = ? AND status IN ('PENDING', 'ACCEPTED', 'PROCESSING', 'PRINTING')").run(
        now(),
        request.id
      );
    } else if (nextState === RequestState.COMPLETED) {
      db.prepare("UPDATE request_items SET status = 'COMPLETED', updated_at = ? WHERE request_id = ?").run(now(), request.id);
    }

    res.json({ request: responseRequest(updated, true) });
  } catch (error) {
    next(error);
  }
});

// Merchant Item-Level Transition (Mixed Cart Item status!)
app.post('/v1/merchant/requests/:requestId/items/:itemId/transition', deviceAuth, (req, res, next) => {
  try {
    const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
    const nextItemStatus = String(req.body.status || '');
    if (!Object.values(ItemStatus).includes(nextItemStatus)) {
      throw new HttpError(400, 'INVALID_ITEM_STATUS', 'Item status is invalid.');
    }

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE request_items SET status = ?, updated_at = ? WHERE id = ? AND request_id = ?').run(
        nextItemStatus,
        now(),
        req.params.itemId,
        request.id
      );

      const allItems = db.prepare('SELECT status FROM request_items WHERE request_id = ?').all(request.id);
      const computedState = computeAggregateRequestState(allItems, request.state);

      let updatedRequest = request;
      if (computedState !== request.state) {
        updatedRequest = transitionRequest(request, computedState, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
          changedItemId: req.params.itemId,
          itemStatus: nextItemStatus,
        });
      }

      db.exec('COMMIT');
      res.json({ request: responseRequest(updatedRequest, true) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Merchant proposes quote for a service item
app.post('/v1/merchant/requests/:requestId/quotes', deviceAuth, (req, res, next) => {
  try {
    const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
    const amountMinor = Number(req.body.amountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      throw new HttpError(400, 'AMOUNT_INVALID', 'Provide a valid quote amount in minor units.');
    }

    const quoteId = id();
    const stamp = now();
    const targetItemId =
      req.body.requestItemId ||
      db.prepare("SELECT id FROM request_items WHERE request_id = ? AND item_type = 'SERVICE' LIMIT 1").get(request.id)?.id ||
      null;

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO service_quotes (id, request_id, request_item_id, amount_minor, merchant_note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(quoteId, request.id, targetItemId, amountMinor, String(req.body.note || '').slice(0, 500), 'PENDING', stamp);

      const updated = transitionRequest(request, RequestState.CUSTOMER_ACTION_REQUIRED, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
        quoteId,
        amountMinor,
      });

      db.exec('COMMIT');
      res.status(201).json({ quote: { id: quoteId, amountMinor, status: 'PENDING' }, request: responseRequest(updated, true) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Merchant print execution submission
app.post('/v1/merchant/requests/:requestId/print-executions', deviceAuth, (req, res, next) => {
  try {
    const result = rememberIdempotent(`device:${req.device.id}:print:${req.params.requestId}`, req.header('x-idempotency-key'), () => {
      const request = requestBelongsToShop(req.params.requestId, req.device.shop_id);
      if (request.state !== RequestState.ACCEPTED && request.state !== RequestState.SUBMITTED) {
        throw new HttpError(409, 'PRINT_NOT_READY', 'Accept this print request before printing it.');
      }
      const printerId = String(req.body.printerId || '').slice(0, 200);
      if (!printerId) throw new HttpError(400, 'PRINTER_REQUIRED', 'Choose a configured printer.');

      const executionId = id();
      db.exec('BEGIN');
      try {
        db.prepare(
          'INSERT INTO print_executions (id, request_id, device_id, printer_id, state, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(executionId, request.id, req.device.id, printerId, 'PENDING', `execution:${executionId}`, now());

        const updated = transitionRequest(request, RequestState.PROCESSING, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
          printExecutionId: executionId,
          printerId,
        });

        db.exec('COMMIT');
        return { status: 201, body: { execution: { id: executionId, state: 'PENDING' }, request: responseRequest(updated, true) } };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });

    res.status(result.status).set('Idempotency-Replayed', String(result.replay)).json(result.body);
  } catch (error) {
    next(error);
  }
});

// Merchant print execution status update
app.post('/v1/merchant/print-executions/:executionId', deviceAuth, (req, res, next) => {
  try {
    const execution = db
      .prepare(
        'SELECT e.*, r.shop_id, r.state AS request_state, r.customer_session_id FROM print_executions e JOIN requests r ON r.id = e.request_id WHERE e.id = ? AND e.device_id = ? AND r.shop_id = ?'
      )
      .get(req.params.executionId, req.device.id, req.device.shop_id);
    if (!execution) throw new HttpError(404, 'PRINT_EXECUTION_NOT_FOUND', 'Print execution not found.');

    const state = String(req.body.state || '');
    if (!['DOWNLOADING', 'SUBMITTED', 'COMPLETED', 'FAILED', 'ATTENTION_REQUIRED', 'CANCELLED'].includes(state)) {
      throw new HttpError(400, 'PRINT_STATE_INVALID', 'Invalid print execution state.');
    }
    if (['COMPLETED', 'FAILED', 'ATTENTION_REQUIRED', 'CANCELLED'].includes(execution.state)) {
      throw new HttpError(409, 'PRINT_EXECUTION_FINAL', 'This print execution is already final and will not be submitted again.');
    }

    const stamp = now();
    db.prepare(
      "UPDATE print_executions SET state = ?, spooler_job_id = COALESCE(?, spooler_job_id), detail = ?, submitted_at = CASE WHEN ? = 'SUBMITTED' THEN ? ELSE submitted_at END, completed_at = CASE WHEN ? IN ('COMPLETED','FAILED','ATTENTION_REQUIRED','CANCELLED') THEN ? ELSE completed_at END WHERE id = ?"
    ).run(state, req.body.spoolerJobId ? String(req.body.spoolerJobId).slice(0, 120) : null, String(req.body.detail || '').slice(0, 500), state, stamp, state, stamp, execution.id);

    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(execution.request_id);
    let updated = request;
    if (state === 'COMPLETED' && request.state === RequestState.PROCESSING) {
      updated = transitionRequest(request, RequestState.READY, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
        printExecutionId: execution.id,
      });
    }
    if (state === 'FAILED' && request.state === RequestState.PROCESSING) {
      updated = transitionRequest(request, RequestState.FAILED, 'MERCHANT_DEVICE', req.device.id, req.correlationId, {
        printExecutionId: execution.id,
      });
    }

    audit({
      requestId: request.id,
      actorType: 'MERCHANT_DEVICE',
      actorId: req.device.id,
      action: `PRINT_${state}`,
      correlationId: req.correlationId,
      metadata: { printExecutionId: execution.id, spoolerJobId: req.body.spoolerJobId ?? null },
    });

    res.json({ execution: { id: execution.id, state }, request: responseRequest(updated, true) });
  } catch (error) {
    next(error);
  }
});

// Merchant document download (secured, short-lived, shop-scoped)
app.get('/v1/merchant/attachments/:attachmentId/download', deviceAuth, (req, res, next) => {
  try {
    const attachment = db
      .prepare(
        'SELECT a.* FROM request_attachments a JOIN requests r ON r.id = a.request_id WHERE a.id = ? AND r.shop_id = ? AND a.deleted_at IS NULL AND a.expires_at > ?'
      )
      .get(req.params.attachmentId, req.device.shop_id, now());
    if (!attachment) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND', 'The attachment is unavailable or has expired.');

    const filePath = resolve(storageDirectory, attachment.object_key);
    if (!filePath.startsWith(resolve(storageDirectory))) throw new HttpError(500, 'ATTACHMENT_PATH_INVALID', 'Storage path error.');

    const file = readFileSync(filePath);
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `attachment; filename="${safeName(attachment.original_name)}"`,
      'Cache-Control': 'private, no-store',
    }).send(file);

    audit({
      requestId: attachment.request_id,
      actorType: 'MERCHANT_DEVICE',
      actorId: req.device.id,
      action: 'ATTACHMENT_DOWNLOADED',
      correlationId: req.correlationId,
      metadata: { attachmentId: attachment.id },
    });
  } catch (error) {
    next(error);
  }
});

// Merchant Portal: Store management
app.get('/v1/merchant/stores', merchantAuth, (_req, res) => {
  const stores = db.prepare('SELECT * FROM shops ORDER BY display_name').all().map((s) => ({
    id: s.id,
    storeCode: s.store_code,
    slug: s.slug,
    displayName: s.display_name,
    address: s.address,
    city: s.city,
    status: s.status,
    operationalStatus: s.operational_status || 'ACTIVE',
    currency: s.currency,
    rates: json(s.rates_json, {}),
    paymentSettings: json(s.payment_settings_json, {}),
    autoPrintRules: json(s.auto_print_rules_json, {}),
    printingEnabled: s.printing_enabled !== 0,
    servicesEnabled: s.services_enabled !== 0,
    stationeryEnabled: s.stationery_enabled !== 0,
    url: `https://sprint.abh1.xyz/s/${s.store_code || s.slug}`,
  }));
  res.json({ stores });
});

app.patch('/v1/merchant/stores/:storeId', merchantAuth, (req, res, next) => {
  try {
    const shop = shopByIdentifier(req.params.storeId);
    const { operationalStatus, rates, paymentSettings, autoPrintRules, printingEnabled, servicesEnabled, stationeryEnabled } = req.body;

    if (operationalStatus && ['ACTIVE', 'PAUSED_BY_MERCHANT'].includes(operationalStatus)) {
      if (shop.operational_status !== 'SUSPENDED_BY_ABH1') {
        db.prepare('UPDATE shops SET operational_status = ?, status = ?, updated_at = ? WHERE id = ?').run(
          operationalStatus,
          operationalStatus === 'ACTIVE' ? 'OPEN' : 'PAUSED',
          now(),
          shop.id
        );
      }
    }
    if (rates) {
      db.prepare('UPDATE shops SET rates_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(rates), now(), shop.id);
    }
    if (paymentSettings) {
      db.prepare('UPDATE shops SET payment_settings_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(paymentSettings), now(), shop.id);
    }
    if (autoPrintRules) {
      db.prepare('UPDATE shops SET auto_print_rules_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(autoPrintRules), now(), shop.id);
    }
    if (printingEnabled !== undefined) {
      db.prepare('UPDATE shops SET printing_enabled = ?, updated_at = ? WHERE id = ?').run(printingEnabled ? 1 : 0, now(), shop.id);
    }
    if (servicesEnabled !== undefined) {
      db.prepare('UPDATE shops SET services_enabled = ?, updated_at = ? WHERE id = ?').run(servicesEnabled ? 1 : 0, now(), shop.id);
    }
    if (stationeryEnabled !== undefined) {
      db.prepare('UPDATE shops SET stationery_enabled = ?, updated_at = ? WHERE id = ?').run(stationeryEnabled ? 1 : 0, now(), shop.id);
    }

    const updated = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    res.json({
      store: {
        id: updated.id,
        storeCode: updated.store_code,
        displayName: updated.display_name,
        operationalStatus: updated.operational_status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Merchant Portal: Add / Edit Stationery Product
app.post('/v1/merchant/stores/:storeId/products', merchantAuth, (req, res, next) => {
  try {
    const shop = shopByIdentifier(req.params.storeId);
    const { name, description = '', category = 'STATIONERY', priceMinor, sku = '', trackInventory = false, quantity = 0 } = req.body;
    if (!name || !priceMinor || priceMinor < 0) throw new HttpError(400, 'INVALID_PRODUCT', 'Name and valid price are required.');

    const productId = req.body.id || id();
    const stamp = now();
    const existing = db.prepare('SELECT id FROM store_products WHERE id = ? AND shop_id = ?').get(productId, shop.id);

    if (existing) {
      db.prepare(
        'UPDATE store_products SET name = ?, description = ?, category = ?, price_minor = ?, sku = ?, track_inventory = ?, quantity = ?, updated_at = ? WHERE id = ?'
      ).run(name, description, category, priceMinor, sku, trackInventory ? 1 : 0, quantity, stamp, productId);
    } else {
      db.prepare(
        'INSERT INTO store_products (id, shop_id, name, description, category, price_minor, sku, available, track_inventory, quantity, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)'
      ).run(productId, shop.id, name, description, category, priceMinor, sku, trackInventory ? 1 : 0, quantity, stamp, stamp);
    }

    res.status(201).json({ id: productId, name, priceMinor });
  } catch (error) {
    next(error);
  }
});

// Platform Admin: Overview & Diagnostics
app.get('/v1/admin/overview', adminAuth, (req, res, next) => {
  try {
    const merchants = db.prepare('SELECT * FROM merchants ORDER BY name').all();
    const shops = db.prepare('SELECT * FROM shops ORDER BY display_name').all();
    const requestsToday = db
      .prepare("SELECT type, state, COUNT(*) AS count, SUM(amount_minor) AS total_minor FROM requests WHERE created_at >= date('now', 'start of day') GROUP BY type, state")
      .all();
    const allRequests = db.prepare('SELECT state, type, COUNT(*) AS count, SUM(amount_minor) AS total_minor FROM requests GROUP BY state, type').all();
    const devices = db
      .prepare('SELECT d.*, s.display_name AS shop_name, s.store_code FROM merchant_devices d JOIN shops s ON s.id = d.shop_id ORDER BY d.last_seen_at DESC')
      .all();
    const failedPrintExecutions = db.prepare("SELECT COUNT(*) AS count FROM print_executions WHERE state IN ('FAILED', 'ATTENTION_REQUIRED')").get().count;
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 30').all();

    const activeMerchants = merchants.filter((m) => m.status === 'ACTIVE').length;
    const activeStores = shops.filter((s) => s.operational_status === 'ACTIVE').length;
    const openStores = shops.filter((s) => s.status === 'OPEN' && s.operational_status === 'ACTIVE').length;
    const totalGtvMinor = db.prepare("SELECT SUM(amount_minor) AS total FROM requests WHERE payment_status = 'PAID'").get().total || 0;

    res.json({
      merchants,
      shops: shops.map((s) => ({
        id: s.id,
        storeCode: s.store_code,
        slug: s.slug,
        displayName: s.display_name,
        address: s.address,
        city: s.city,
        status: s.status,
        operationalStatus: s.operational_status || 'ACTIVE',
        printingEnabled: s.printing_enabled !== 0,
        servicesEnabled: s.services_enabled !== 0,
        stationeryEnabled: s.stationery_enabled !== 0,
      })),
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        version: d.version,
        status: d.status,
        lastSeenAt: d.last_seen_at,
        shopName: d.shop_name,
        storeCode: d.store_code,
      })),
      stats: {
        activeMerchants,
        totalMerchants: merchants.length,
        activeStores,
        openStores,
        totalStores: shops.length,
        requestsToday,
        allRequests,
        totalGtvMinor,
        failedPrintExecutions,
      },
      recentActivity: auditLogs.map((l) => ({
        id: l.id,
        actorType: l.actor_type,
        action: l.action,
        timestamp: l.created_at,
        metadata: json(l.metadata_json),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Platform Admin: Create Merchant
app.post('/v1/admin/merchants', adminAuth, (req, res, next) => {
  try {
    const { name, slug: rawSlug, contactEmail = '', contactPhone = '' } = req.body;
    if (!name) throw new HttpError(400, 'NAME_REQUIRED', 'Merchant name is required.');
    const slug = (rawSlug || name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)).replace(/^-+|-+$/g, '');
    const merchantId = id();
    const stamp = now();

    db.prepare(
      'INSERT INTO merchants (id, name, slug, status, contact_email, contact_phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(merchantId, name, slug, 'ACTIVE', contactEmail, contactPhone, stamp, stamp);

    audit({ actorType: 'ADMIN', action: 'MERCHANT_CREATED', correlationId: req.correlationId, metadata: { merchantId, name, slug } });
    res.status(201).json({ id: merchantId, name, slug, status: 'ACTIVE' });
  } catch (error) {
    next(error);
  }
});

// Platform Admin: Add Store with permanent 5-character Store Code
app.post('/v1/admin/stores', adminAuth, (req, res, next) => {
  try {
    const { merchantId, displayName, address = '', city = '', rates, initialServices = true, initialStationery = true } = req.body;
    if (!displayName) throw new HttpError(400, 'DISPLAY_NAME_REQUIRED', 'Store display name is required.');

    const merchant = merchantId ? db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) : null;
    const resolvedMerchantId = merchant ? merchant.id : '00000000-0000-0000-0000-000000000001';

    // Generate unique 5-character Store Code
    let storeCode = '';
    for (let attempts = 0; attempts < 100; attempts++) {
      const candidate = generateStoreCode();
      const existing = db.prepare('SELECT store_code FROM store_code_reservations WHERE store_code = ?').get(candidate);
      if (!existing) {
        storeCode = candidate;
        break;
      }
    }
    if (!storeCode) throw new HttpError(500, 'CODE_GENERATION_FAILED', 'Could not generate unique store code.');

    const storeId = id();
    const slug = `${storeCode.toLowerCase()}-${displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
    const stamp = now();
    const storeRates = rates || { A4_BW_SINGLE: 200, A4_BW_DUPLEX: 300, A4_COLOR_SINGLE: 1000, A4_COLOR_DUPLEX: 1500 };
    const paymentSettings = { onlineEnabled: true, payAtCounterEnabled: true, upiQrEnabled: true, upiId: `${storeCode.toLowerCase()}@upi`, autoPrintRequiresOnlinePayment: true };

    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO store_code_reservations (store_code, shop_id, merchant_id, retired_at) VALUES (?, ?, ?, NULL)').run(
        storeCode,
        storeId,
        resolvedMerchantId
      );

      db.prepare(
        'INSERT INTO shops (id, slug, display_name, status, rates_json, auto_print_rules_json, created_at, updated_at, merchant_id, store_code, address, city, operational_status, payment_settings_json, stationery_enabled, printing_enabled, services_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        storeId,
        slug,
        displayName,
        'OPEN',
        JSON.stringify(storeRates),
        JSON.stringify({ enabled: false, paidOnly: true, blackAndWhiteOnly: true, paperSizes: ['A4'], pdfOnly: true, maxPages: 10, printerId: null }),
        stamp,
        stamp,
        resolvedMerchantId,
        storeCode,
        address,
        city,
        'ACTIVE',
        JSON.stringify(paymentSettings),
        1,
        1,
        1
      );

      // Seed standard services
      if (initialServices) {
        db.prepare(
          'INSERT INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)'
        ).run(id(), storeId, 'A4 Document Lamination', 'FINISHING', 'Pouch lamination for documents and certificates', 'FIXED', 3000, 'AT_COUNTER', JSON.stringify([{ id: 'copies', name: 'copies', label: 'Number of documents', type: 'NUMBER', required: true }]), 'Hand over documents at the counter.', stamp, stamp);
      }

      // Seed standard stationery
      if (initialStationery) {
        db.prepare(
          'INSERT INTO store_products (id, shop_id, name, description, category, price_minor, sku, available, track_inventory, quantity, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 50, 1, ?, ?)'
        ).run(id(), storeId, 'Blue Ball Pen', 'Smooth writing pen', 'Writing', 1000, 'PEN-01', stamp, stamp);
      }

      audit({ actorType: 'ADMIN', action: 'STORE_CREATED', correlationId: req.correlationId, metadata: { storeId, storeCode, displayName } });
      db.exec('COMMIT');

      res.status(201).json({
        id: storeId,
        storeCode,
        slug,
        displayName,
        address,
        city,
        operationalStatus: 'ACTIVE',
        canonicalUrl: `https://sprint.abh1.xyz/s/${storeCode}`,
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Platform Admin: Suspend or activate store
app.patch('/v1/admin/stores/:storeId', adminAuth, (req, res, next) => {
  try {
    const shop = shopByIdentifier(req.params.storeId);
    const { operationalStatus } = req.body;
    if (!['ACTIVE', 'SUSPENDED_BY_ABH1'].includes(operationalStatus)) {
      throw new HttpError(400, 'INVALID_STATUS', 'Status must be ACTIVE or SUSPENDED_BY_ABH1.');
    }

    db.prepare('UPDATE shops SET operational_status = ?, updated_at = ? WHERE id = ?').run(operationalStatus, now(), shop.id);
    audit({ actorType: 'ADMIN', action: `STORE_${operationalStatus}`, correlationId: req.correlationId, metadata: { shopId: shop.id } });
    res.json({ id: shop.id, storeCode: shop.store_code, operationalStatus });
  } catch (error) {
    next(error);
  }
});

// Platform Admin: Revoke device
app.post('/v1/admin/devices/:deviceId/revoke', adminAuth, (req, res, next) => {
  try {
    const device = db.prepare('SELECT * FROM merchant_devices WHERE id = ?').get(req.params.deviceId);
    if (!device) throw new HttpError(404, 'DEVICE_NOT_FOUND', 'Device not found.');

    db.prepare("UPDATE merchant_devices SET status = 'REVOKED' WHERE id = ?").run(device.id);
    audit({ actorType: 'ADMIN', action: 'DEVICE_REVOKED', correlationId: req.correlationId, metadata: { deviceId: device.id } });
    res.json({ id: device.id, status: 'REVOKED' });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    error = new HttpError(413, 'UPLOAD_TOO_LARGE', `Files must be ${Math.floor(uploadLimit / 1024 / 1024)} MB or smaller.`);
  }
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  log(status >= 500 ? 'error' : 'warn', 'api.error', {
    correlationId: req.correlationId,
    status,
    code,
    message: error.message,
  });
  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Sprint could not complete that action. Please try again.' : error.message,
      details: error instanceof HttpError ? error.details : undefined,
    },
    requestId: req.correlationId,
  });
});

const server = createServer(app);
const webSocketServer = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname !== '/v1/realtime') return socket.destroy();
  const ticket = url.searchParams.get('ticket');
  const record = ticket && tickets.get(ticket);
  if (!record || record.expiresAt < Date.now()) return socket.destroy();
  tickets.delete(ticket);
  webSocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocket.principal = record.principal;
    webSocketServer.emit('connection', websocket);
  });
});

webSocketServer.on('connection', (websocket) => {
  connections.add(websocket);
  websocket.send(JSON.stringify({ type: 'connected', at: now() }));
  websocket.on('close', () => connections.delete(websocket));
});

export { app, db, server, storageDirectory };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  server.listen(port, () => log('info', 'api.started', { port, environment: process.env.NODE_ENV || 'development', developmentPayments }));
}
