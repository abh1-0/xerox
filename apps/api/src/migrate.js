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
  return db;
}

export function seed(db = openDatabase()) {
  const existing = db.prepare('SELECT id FROM shops WHERE slug = ?').get('abh1-demo');
  if (existing) return existing.id;
  const now = new Date().toISOString();
  const shopId = randomUUID();
  const serviceId = randomUUID();
  const rates = { A4_BW_SINGLE: 200, A4_BW_DUPLEX: 300, A4_COLOR_SINGLE: 1000, A4_COLOR_DUPLEX: 1500 };
  db.prepare('INSERT INTO shops (id, slug, display_name, status, rates_json, auto_print_rules_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(shopId, 'abh1-demo', 'abh1 Print & Services', 'OPEN', JSON.stringify(rates), JSON.stringify({ enabled: false, paidOnly: true, blackAndWhiteOnly: true, paperSizes: ['A4'], pdfOnly: true, maxPages: 10, printerId: null }), now, now);
  db.prepare('INSERT INTO service_definitions (id, shop_id, name, category, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .run(serviceId, shopId, 'PAN application assistance', 'DOCUMENT_ASSISTANCE', 'Merchant assistance for preparing a PAN application. Complete any official authentication yourself on the relevant official site.', 'FIXED', 15000, 'AT_COUNTER', JSON.stringify([{ id: 'fullName', name: 'fullName', label: 'Name on identity document', type: 'SHORT_TEXT', required: true }, { id: 'consent', name: 'consent', label: 'I understand this is merchant assistance, not an official PAN service.', type: 'CHECKBOX', required: true }]), 'Bring your identity/address documents. Do not share passwords, OTPs, PINs, or DigiLocker credentials.', now, now);
  return shopId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = migrate();
  if (process.argv.includes('--seed')) seed(db);
  console.log(`Sprint database ready: ${databasePath}`);
}
