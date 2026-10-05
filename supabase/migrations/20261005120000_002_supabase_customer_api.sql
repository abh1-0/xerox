-- Supabase implementation for the public Sprint customer API.
-- All business tables remain private behind the sprint-api Edge Function.

create sequence if not exists public.sprint_request_number_seq start with 4821;

create table if not exists public.sprint_shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  display_name text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'PAUSED')),
  currency text not null default 'INR',
  rates_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sprint_services (
  id text primary key,
  shop_id uuid not null references public.sprint_shops(id) on delete cascade,
  name text not null,
  description text not null,
  price_mode text not null check (price_mode in ('FIXED', 'MERCHANT_QUOTE')),
  price_minor integer not null default 0 check (price_minor >= 0),
  payment_timing text not null check (payment_timing in ('BEFORE_SUBMISSION', 'AT_COUNTER')),
  fields_json jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sprint_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.sprint_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('S-' || nextval('public.sprint_request_number_seq')::text),
  shop_id uuid not null references public.sprint_shops(id),
  customer_session_id uuid not null references public.sprint_customer_sessions(id),
  type text not null check (type in ('PRINT', 'SERVICE')),
  state text not null check (state in ('AWAITING_PAYMENT', 'PAID', 'SUBMITTED', 'ACCEPTED', 'PROCESSING', 'CUSTOMER_ACTION_REQUIRED', 'READY', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED')),
  amount_minor integer not null default 0 check (amount_minor >= 0),
  currency text not null default 'INR',
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sprint_attachments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.sprint_shops(id),
  customer_session_id uuid not null references public.sprint_customer_sessions(id),
  request_id uuid references public.sprint_requests(id) on delete set null,
  object_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  page_count integer not null default 1 check (page_count > 0),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sprint_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.sprint_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sprint_services_shop_idx on public.sprint_services(shop_id) where enabled;
create index if not exists sprint_requests_session_idx on public.sprint_requests(customer_session_id, created_at desc);
create index if not exists sprint_attachments_session_idx on public.sprint_attachments(customer_session_id, created_at desc);
create index if not exists sprint_request_events_request_idx on public.sprint_request_events(request_id, created_at asc);

alter table public.sprint_shops enable row level security;
alter table public.sprint_services enable row level security;
alter table public.sprint_customer_sessions enable row level security;
alter table public.sprint_requests enable row level security;
alter table public.sprint_attachments enable row level security;
alter table public.sprint_request_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on sequence public.sprint_request_number_seq from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sprint-documents', 'sprint-documents', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into public.sprint_shops (slug, display_name, status, currency, rates_json)
values ('abh1-demo', 'abh1 Print & Services', 'OPEN', 'INR', '{"A4_BW_SINGLE":200,"A4_BW_DUPLEX":300,"A4_COLOR_SINGLE":1000,"A4_COLOR_DUPLEX":1500}'::jsonb)
on conflict (slug) do update set display_name = excluded.display_name, status = excluded.status, currency = excluded.currency, rates_json = excluded.rates_json, updated_at = now();

insert into public.sprint_services (id, shop_id, name, description, price_mode, price_minor, payment_timing, fields_json, instructions, enabled)
select 'pan_assistance', id, 'PAN application assistance', 'Bring your documents and let the shop help prepare your application.', 'FIXED', 9900, 'AT_COUNTER',
  '[{"id":"fullName","label":"Full name","type":"TEXT","required":true},{"id":"phone","label":"Phone number","type":"TEXT","required":true},{"id":"consent","label":"I understand this is merchant assistance, not an official service.","type":"CHECKBOX","required":true}]'::jsonb,
  'The shop confirms the final documents and charge at the counter.', true
from public.sprint_shops where slug = 'abh1-demo'
on conflict (id) do update set name = excluded.name, description = excluded.description, price_mode = excluded.price_mode, price_minor = excluded.price_minor, payment_timing = excluded.payment_timing, fields_json = excluded.fields_json, instructions = excluded.instructions, enabled = excluded.enabled, updated_at = now();
