import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const root = fileURLToPath(new URL('../../..', import.meta.url));
export const dataDirectory = process.env.SPRINT_DATA_DIR || join(root, '.sprint-data');
export const databasePath = process.env.SPRINT_DATABASE_PATH || join(dataDirectory, 'sprint.sqlite');

export function openDatabase() {
  mkdirSync(dataDirectory, { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return db;
}

export function migrate(db = openDatabase()) {
  const migrationDirectory = join(root, 'database', 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const file of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    const hasRun = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(file);
    if (hasRun) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(migrationDirectory, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  // Ensure new columns exist on shops
  const columns = db.prepare("PRAGMA table_info(shops)").all().map((c) => c.name);
  if (!columns.includes('merchant_id')) db.exec("ALTER TABLE shops ADD COLUMN merchant_id TEXT;");
  if (!columns.includes('store_code')) db.exec("ALTER TABLE shops ADD COLUMN store_code TEXT;");
  if (!columns.includes('address')) db.exec("ALTER TABLE shops ADD COLUMN address TEXT DEFAULT '';");
  if (!columns.includes('city')) db.exec("ALTER TABLE shops ADD COLUMN city TEXT DEFAULT '';");
  if (!columns.includes('operational_status')) db.exec("ALTER TABLE shops ADD COLUMN operational_status TEXT DEFAULT 'ACTIVE';");
  if (!columns.includes('payment_settings_json')) db.exec("ALTER TABLE shops ADD COLUMN payment_settings_json TEXT DEFAULT '{\"onlineEnabled\":true,\"payAtCounterEnabled\":true,\"upiQrEnabled\":true,\"upiId\":\"\",\"autoPrintRequiresOnlinePayment\":true}';");
  if (!columns.includes('stationery_enabled')) db.exec("ALTER TABLE shops ADD COLUMN stationery_enabled INTEGER DEFAULT 1;");
  if (!columns.includes('printing_enabled')) db.exec("ALTER TABLE shops ADD COLUMN printing_enabled INTEGER DEFAULT 1;");
  if (!columns.includes('services_enabled')) db.exec("ALTER TABLE shops ADD COLUMN services_enabled INTEGER DEFAULT 1;");

  // Ensure columns on requests
  const requestCols = db.prepare("PRAGMA table_info(requests)").all().map((c) => c.name);
  if (!requestCols.includes('customer_note')) db.exec("ALTER TABLE requests ADD COLUMN customer_note TEXT DEFAULT '';");
  if (!requestCols.includes('payment_method')) db.exec("ALTER TABLE requests ADD COLUMN payment_method TEXT DEFAULT 'PENDING';");

  // Ensure columns on service_definitions
  const serviceCols = db.prepare("PRAGMA table_info(service_definitions)").all().map((c) => c.name);
  if (!serviceCols.includes('sort_order')) db.exec("ALTER TABLE service_definitions ADD COLUMN sort_order INTEGER DEFAULT 0;");

  return db;
}

export function seed(db = openDatabase()) {
  const now = new Date().toISOString();
  
  // Seed default platform merchant
  const existingMerchant = db.prepare('SELECT id FROM merchants WHERE slug = ?').get('abh1-default');
  const merchantId = existingMerchant ? existingMerchant.id : '00000000-0000-0000-0000-000000000001';
  if (!existingMerchant) {
    db.prepare('INSERT INTO merchants (id, name, slug, status, contact_email, contact_phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(merchantId, 'abh1 Platform Merchant', 'abh1-default', 'ACTIVE', 'operations@abh1.xyz', '+91 90000 00000', now, now);
  }

  // Seed shop
  let shopId;
  const existingShop = db.prepare('SELECT id, store_code FROM shops WHERE slug = ?').get('abh1-demo');
  const rates = { A4_BW_SINGLE: 200, A4_BW_DUPLEX: 300, A4_COLOR_SINGLE: 1000, A4_COLOR_DUPLEX: 1500 };
  const paymentSettings = { onlineEnabled: true, payAtCounterEnabled: true, upiQrEnabled: true, upiId: 'abh1@upi', autoPrintRequiresOnlinePayment: true };

  if (existingShop) {
    shopId = existingShop.id;
    db.prepare('UPDATE shops SET merchant_id = ?, store_code = ?, address = ?, city = ?, operational_status = ?, payment_settings_json = ?, stationery_enabled = 1, printing_enabled = 1, services_enabled = 1 WHERE id = ?')
      .run(merchantId, '7KD3P', '1st Floor, Metro Pillar 42, Main Road, Uppal', 'Hyderabad', 'ACTIVE', JSON.stringify(paymentSettings), shopId);
  } else {
    shopId = randomUUID();
    db.prepare('INSERT INTO shops (id, slug, display_name, status, rates_json, auto_print_rules_json, created_at, updated_at, merchant_id, store_code, address, city, operational_status, payment_settings_json, stationery_enabled, printing_enabled, services_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(shopId, 'abh1-demo', 'abh1 Print & Services', 'OPEN', JSON.stringify(rates), JSON.stringify({ enabled: false, paidOnly: true, blackAndWhiteOnly: true, paperSizes: ['A4'], pdfOnly: true, maxPages: 10, printerId: null }), now, now, merchantId, '7KD3P', '1st Floor, Metro Pillar 42, Main Road, Uppal', 'Hyderabad', 'ACTIVE', JSON.stringify(paymentSettings), 1, 1, 1);
  }

  // Reservation for 7KD3P
  db.prepare('INSERT OR IGNORE INTO store_code_reservations (store_code, shop_id, merchant_id, retired_at) VALUES (?, ?, ?, NULL)')
    .run('7KD3P', shopId, merchantId);

  // Seed services
  const panService = db.prepare('SELECT id FROM service_definitions WHERE shop_id = ? AND name LIKE ?').get(shopId, '%PAN%');
  if (!panService) {
    db.prepare('INSERT INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)')
      .run('pan_assistance', shopId, 'PAN application assistance', 'DOCUMENT_ASSISTANCE', 'Merchant assistance for preparing a PAN application. Complete any official authentication yourself on the relevant official site.', 'FIXED', 9900, 'AT_COUNTER', JSON.stringify([{ id: 'fullName', name: 'fullName', label: 'Name on identity document', type: 'SHORT_TEXT', required: true }, { id: 'consent', name: 'consent', label: 'I understand this is merchant assistance, not an official PAN service.', type: 'CHECKBOX', required: true }]), 'Bring your identity/address documents. Do not share passwords, OTPs, PINs, or DigiLocker credentials.', now, now);
  } else {
    db.prepare('UPDATE service_definitions SET sort_order = 1 WHERE id = ?').run(panService.id);
  }

  const lamService = db.prepare('SELECT id FROM service_definitions WHERE shop_id = ? AND name LIKE ?').get(shopId, '%Lamination%');
  if (!lamService) {
    db.prepare('INSERT INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2, ?, ?)')
      .run('doc_lamination', shopId, 'A4 Document Lamination', 'FINISHING', 'High quality 125 micron pouch lamination for certificates and ID copies.', 'FIXED', 3000, 'AT_COUNTER', JSON.stringify([{ id: 'copies', name: 'copies', label: 'Number of documents', type: 'NUMBER', required: true }]), 'Hand over your documents at the counter for instant lamination.', now, now);
  } else {
    db.prepare('UPDATE service_definitions SET sort_order = 2 WHERE id = ?').run(lamService.id);
  }

  const scanService = db.prepare('SELECT id FROM service_definitions WHERE shop_id = ? AND name LIKE ?').get(shopId, '%Scanning%');
  if (!scanService) {
    db.prepare('INSERT INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 3, ?, ?)')
      .run('doc_scanning', shopId, 'Document Scanning & Email', 'SCANNING', 'High-res color or B&W scanning to PDF or JPEG.', 'FIXED', 1500, 'AT_COUNTER', JSON.stringify([{ id: 'email', name: 'email', label: 'Your Email address to receive scans', type: 'SHORT_TEXT', required: true }, { id: 'pageCount', name: 'pageCount', label: 'Approximate number of pages', type: 'NUMBER', required: true }]), 'Merchant will scan your physical documents and dispatch directly to your email.', now, now);
  } else {
    db.prepare('UPDATE service_definitions SET sort_order = 3 WHERE id = ?').run(scanService.id);
  }

  // Seed stationery products
  const products = [
    { name: 'Blue Ball Pen', desc: 'Smooth 0.7mm writing pen for office & counter use', cat: 'Writing', price: 1000, sku: 'PEN-BLU-01', qty: 100, sort: 1 },
    { name: 'A4 Ruled Notebook', desc: '120 pages single line ruled notebook', cat: 'Notebooks', price: 6000, sku: 'NB-A4-120', qty: 30, sort: 2 },
    { name: 'Plastic File Folder', desc: 'Clear L-type document folder', cat: 'Filing', price: 2000, sku: 'FLD-CLR-L', qty: 50, sort: 3 },
    { name: 'Document Envelope', desc: 'Standard brown legal mailing envelope', cat: 'Packaging', price: 500, sku: 'ENV-BRN-STD', qty: 200, sort: 4 },
  ];

  for (const prod of products) {
    const existing = db.prepare('SELECT id FROM store_products WHERE shop_id = ? AND name = ?').get(shopId, prod.name);
    if (!existing) {
      db.prepare('INSERT INTO store_products (id, shop_id, name, description, category, price_minor, sku, available, track_inventory, quantity, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)')
        .run(randomUUID(), shopId, prod.name, prod.desc, prod.cat, prod.price, prod.sku, prod.qty, prod.sort, now, now);
    }
  }

  return shopId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = migrate();
  if (process.argv.includes('--seed')) seed(db);
  console.log(`Sprint database ready: ${databasePath}`);
}
