PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('OPEN','PAUSED')),
  currency TEXT NOT NULL DEFAULT 'INR', rates_json TEXT NOT NULL, auto_print_rules_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS merchant_devices (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')), created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, capabilities_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS service_definitions (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
  price_mode TEXT NOT NULL CHECK(price_mode IN ('FIXED','STARTING_AT','MERCHANT_QUOTE','FREE')), price_minor INTEGER, payment_timing TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]', instructions TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, request_number TEXT NOT NULL UNIQUE, shop_id TEXT NOT NULL REFERENCES shops(id), customer_session_id TEXT NOT NULL REFERENCES customer_sessions(id),
  type TEXT NOT NULL CHECK(type IN ('PRINT','COPY','SCAN','SERVICE','STATIONERY','MIXED')), state TEXT NOT NULL, amount_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
  payment_status TEXT NOT NULL, service_definition_id TEXT REFERENCES service_definitions(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_shop_state ON requests(shop_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_customer ON requests(customer_session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS print_request_details (
  request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE, page_range TEXT NOT NULL, selected_page_count INTEGER NOT NULL,
  copies INTEGER NOT NULL, color_mode TEXT NOT NULL CHECK(color_mode IN ('BW','COLOR')), paper_size TEXT NOT NULL, sides TEXT NOT NULL CHECK(sides IN ('SINGLE','DUPLEX')),
  orientation TEXT NOT NULL CHECK(orientation IN ('AUTO','PORTRAIT','LANDSCAPE')), scale_mode TEXT NOT NULL CHECK(scale_mode IN ('FIT','ACTUAL'))
);
CREATE TABLE IF NOT EXISTS service_request_details (
  request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE, field_values_json TEXT NOT NULL DEFAULT '{}', customer_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS request_attachments (
  id TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id) ON DELETE SET NULL, customer_session_id TEXT NOT NULL REFERENCES customer_sessions(id), shop_id TEXT NOT NULL REFERENCES shops(id),
  object_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum TEXT NOT NULL, page_count INTEGER,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attachments_expiry ON request_attachments(expires_at) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, event_type TEXT NOT NULL,
  previous_state TEXT, next_state TEXT, actor_type TEXT NOT NULL, actor_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_events_request ON request_events(request_id, created_at);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, provider TEXT NOT NULL, provider_reference TEXT, status TEXT NOT NULL,
  amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, created_at TEXT NOT NULL, verified_at TEXT
);
CREATE TABLE IF NOT EXISTS print_executions (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, device_id TEXT NOT NULL REFERENCES merchant_devices(id), printer_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','DOWNLOADING','SUBMITTED','COMPLETED','FAILED','ATTENTION_REQUIRED','CANCELLED')), idempotency_key TEXT NOT NULL UNIQUE,
  spooler_job_id TEXT, detail TEXT, created_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL, key TEXT NOT NULL, response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(scope, key)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, request_id TEXT REFERENCES requests(id) ON DELETE SET NULL, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  request_correlation_id TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
