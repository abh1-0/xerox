CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','SUSPENDED')),
  contact_email TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_memberships (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES merchant_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('OWNER','MANAGER','STAFF')),
  created_at TEXT NOT NULL,
  UNIQUE(merchant_id, user_id)
);

CREATE TABLE IF NOT EXISTS store_code_reservations (
  store_code TEXT PRIMARY KEY,
  shop_id TEXT,
  merchant_id TEXT,
  retired_at TEXT
);

CREATE TABLE IF NOT EXISTS store_products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'STATIONERY',
  price_minor INTEGER NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  track_inventory INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_pairing_codes (
  id TEXT PRIMARY KEY,
  pairing_code TEXT NOT NULL UNIQUE,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Sprint Windows Terminal',
  device_token_hash TEXT,
  device_id TEXT,
  claimed INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('PRINT','SERVICE','PRODUCT')),
  title TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  configuration_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_quotes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  request_item_id TEXT REFERENCES request_items(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  merchant_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  responded_at TEXT
);
