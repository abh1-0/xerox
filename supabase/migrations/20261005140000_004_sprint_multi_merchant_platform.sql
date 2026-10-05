-- 004_sprint_multi_merchant_platform.sql
-- Forward migration to establish multi-merchant, multi-store architecture,
-- store codes, stationery products, unified request items, quotes, and audit.

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.merchants (id, name, slug, status, contact_email)
values ('00000000-0000-0000-0000-000000000001', 'abh1 Platform Merchant', 'abh1-default', 'ACTIVE', 'operations@abh1.xyz')
on conflict (slug) do nothing;

create table if not exists public.merchant_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_memberships (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references public.merchant_users(id) on delete cascade,
  role text not null default 'OWNER' check (role in ('OWNER', 'MANAGER', 'STAFF')),
  created_at timestamptz not null default now(),
  unique(merchant_id, user_id)
);

alter table public.sprint_shops
  add column if not exists merchant_id uuid references public.merchants(id),
  add column if not exists store_code text,
  add column if not exists address text not null default '',
  add column if not exists city text not null default '',
  add column if not exists operational_status text not null default 'ACTIVE' check (operational_status in ('ACTIVE', 'PAUSED_BY_MERCHANT', 'SUSPENDED_BY_ABH1')),
  add column if not exists payment_settings_json jsonb not null default '{"onlineEnabled":true,"payAtCounterEnabled":true,"upiQrEnabled":true,"upiId":"","autoPrintRequiresOnlinePayment":true}'::jsonb,
  add column if not exists auto_print_rules_json jsonb not null default '{"enabled":false,"paidOnly":true,"blackAndWhiteOnly":true,"paperSizes":["A4"],"pdfOnly":true,"maxPages":10,"printerId":null}'::jsonb,
  add column if not exists printing_enabled boolean not null default true,
  add column if not exists services_enabled boolean not null default true,
  add column if not exists stationery_enabled boolean not null default true;

update public.sprint_shops
set store_code = '7KD3P',
    merchant_id = '00000000-0000-0000-0000-000000000001',
    address = '1st Floor, Metro Pillar 42, Main Road, Uppal',
    city = 'Hyderabad'
where slug = 'abh1-demo' and (store_code is null or store_code = '');

create unique index if not exists sprint_shops_store_code_idx on public.sprint_shops(store_code) where store_code is not null;

create table if not exists public.store_code_reservations (
  store_code text primary key check (store_code ~ '^[2-9A-HJ-NP-Z]{5}$'),
  shop_id uuid,
  merchant_id uuid,
  retired_at timestamptz
);

insert into public.store_code_reservations (store_code, shop_id, merchant_id)
select store_code, id, merchant_id from public.sprint_shops where store_code is not null
on conflict (store_code) do nothing;

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.sprint_shops(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'STATIONERY',
  price_minor integer not null check (price_minor >= 0),
  sku text not null default '',
  image_url text not null default '',
  available boolean not null default true,
  track_inventory boolean not null default false,
  quantity integer not null default 0 check (quantity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_products_shop_idx on public.store_products(shop_id) where available;

insert into public.store_products (shop_id, name, description, category, price_minor, sku, available, track_inventory, quantity, sort_order)
select id, 'Blue Ball Pen', 'Smooth 0.7mm writing pen for office & counter use', 'Writing', 1000, 'PEN-BLU-01', true, true, 100, 1
from public.sprint_shops where slug = 'abh1-demo'
union all
select id, 'A4 Ruled Notebook', '120 pages single line ruled notebook', 'Notebooks', 6000, 'NB-A4-120', true, true, 30, 2
from public.sprint_shops where slug = 'abh1-demo'
union all
select id, 'Plastic File Folder', 'Clear L-type document folder', 'Filing', 2000, 'FLD-CLR-L', true, true, 50, 3
from public.sprint_shops where slug = 'abh1-demo'
union all
select id, 'Document Envelope', 'Standard brown legal mailing envelope', 'Packaging', 500, 'ENV-BRN-STD', true, true, 200, 4
from public.sprint_shops where slug = 'abh1-demo'
on conflict do nothing;

alter table public.sprint_services drop constraint if exists sprint_services_price_mode_check;
alter table public.sprint_services add constraint sprint_services_price_mode_check check (price_mode in ('FREE', 'FIXED', 'STARTING_AT', 'MERCHANT_QUOTE', 'PAY_AT_COUNTER'));
alter table public.sprint_services add column if not exists category text not null default 'DOCUMENT_ASSISTANCE';
alter table public.sprint_services add column if not exists customer_instructions text not null default '';
alter table public.sprint_services add column if not exists merchant_instructions text not null default '';
alter table public.sprint_services add column if not exists estimated_time text not null default '10-15 mins';
alter table public.sprint_services add column if not exists sort_order integer not null default 0;

insert into public.sprint_services (id, shop_id, name, description, category, price_mode, price_minor, payment_timing, fields_json, customer_instructions, enabled, sort_order)
select 'doc_lamination', id, 'A4 Document Lamination', 'High quality 125 micron pouch lamination for certificates and ID copies.', 'FINISHING', 'FIXED', 3000, 'AT_COUNTER',
  '[{"id":"copies","label":"Number of documents","type":"NUMBER","required":true}]'::jsonb,
  'Hand over your documents at the counter for instant lamination.', true, 2
from public.sprint_shops where slug = 'abh1-demo'
on conflict (id) do nothing;

insert into public.sprint_services (id, shop_id, name, description, category, price_mode, price_minor, payment_timing, fields_json, customer_instructions, enabled, sort_order)
select 'doc_scanning', id, 'Document Scanning & Email', 'High-res color or B&W scanning to PDF or JPEG.', 'SCANNING', 'FIXED', 1500, 'AT_COUNTER',
  '[{"id":"email","label":"Your Email address to receive scans","type":"TEXT","required":true},{"id":"pageCount","label":"Approximate number of pages","type":"NUMBER","required":true}]'::jsonb,
  'Merchant will scan your physical documents and dispatch directly to your email.', true, 3
from public.sprint_shops where slug = 'abh1-demo'
on conflict (id) do nothing;

create table if not exists public.merchant_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.sprint_shops(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  version text not null default '0.1.0',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  capabilities_json jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists merchant_devices_shop_idx on public.merchant_devices(shop_id);

create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  pairing_code text not null unique,
  shop_id uuid not null references public.sprint_shops(id) on delete cascade,
  device_name text not null default 'Sprint Windows Terminal',
  device_token_hash text,
  device_id uuid references public.merchant_devices(id) on delete cascade,
  claimed boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.sprint_requests drop constraint if exists sprint_requests_type_check;
alter table public.sprint_requests add constraint sprint_requests_type_check check (type in ('PRINT', 'SERVICE', 'STATIONERY', 'MIXED'));

alter table public.sprint_requests drop constraint if exists sprint_requests_state_check;
alter table public.sprint_requests add constraint sprint_requests_state_check check (state in ('DRAFT', 'AWAITING_QUOTE', 'AWAITING_PAYMENT', 'PAID', 'SUBMITTED', 'ACCEPTED', 'PROCESSING', 'PRINTING', 'CUSTOMER_ACTION_REQUIRED', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED', 'REFUND_PENDING', 'REFUNDED'));

alter table public.sprint_requests add column if not exists payment_method text not null default 'PENDING';
alter table public.sprint_requests add column if not exists customer_note text not null default '';

create table if not exists public.sprint_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sprint_requests(id) on delete cascade,
  item_type text not null check (item_type in ('PRINT', 'SERVICE', 'PRODUCT')),
  title text not null,
  amount_minor integer not null default 0 check (amount_minor >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'PROCESSING', 'PRINTING', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED')),
  configuration_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sprint_request_items_request_idx on public.sprint_request_items(request_id);

create table if not exists public.service_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sprint_requests(id) on delete cascade,
  request_item_id uuid references public.sprint_request_items(id) on delete cascade,
  amount_minor integer not null check (amount_minor >= 0),
  merchant_note text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.print_executions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sprint_requests(id) on delete cascade,
  request_item_id uuid references public.sprint_request_items(id) on delete set null,
  device_id uuid references public.merchant_devices(id),
  printer_id text not null,
  state text not null check (state in ('PENDING', 'DOWNLOADING', 'SUBMITTED', 'COMPLETED', 'FAILED', 'ATTENTION_REQUIRED', 'CANCELLED')),
  idempotency_key text not null unique,
  spooler_job_id text,
  detail text not null default '',
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists print_executions_request_idx on public.print_executions(request_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sprint_requests(id) on delete cascade,
  provider text not null check (provider in ('PAY_AT_COUNTER', 'UPI_QR', 'RAZORPAY', 'DEVELOPMENT_ONLY')),
  provider_reference text,
  status text not null check (status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'INR',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('ADMIN', 'MERCHANT', 'CUSTOMER', 'DEVICE', 'SYSTEM')),
  actor_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  correlation_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_action_idx on public.audit_events(action, created_at desc);

alter table public.merchants enable row level security;
alter table public.merchant_users enable row level security;
alter table public.merchant_memberships enable row level security;
alter table public.store_code_reservations enable row level security;
alter table public.store_products enable row level security;
alter table public.merchant_devices enable row level security;
alter table public.device_pairing_codes enable row level security;
alter table public.sprint_request_items enable row level security;
alter table public.service_quotes enable row level security;
alter table public.print_executions enable row level security;
alter table public.payments enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
