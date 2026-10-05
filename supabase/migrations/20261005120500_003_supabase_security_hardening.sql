-- Explicitly deny direct Data API access. The sprint-api Edge Function owns all access.
create index if not exists sprint_requests_shop_idx on public.sprint_requests(shop_id);
create index if not exists sprint_attachments_shop_idx on public.sprint_attachments(shop_id);
create index if not exists sprint_attachments_request_idx on public.sprint_attachments(request_id) where request_id is not null;

drop policy if exists sprint_shops_private on public.sprint_shops;
create policy sprint_shops_private on public.sprint_shops for all to anon, authenticated using (false) with check (false);
drop policy if exists sprint_services_private on public.sprint_services;
create policy sprint_services_private on public.sprint_services for all to anon, authenticated using (false) with check (false);
drop policy if exists sprint_customer_sessions_private on public.sprint_customer_sessions;
create policy sprint_customer_sessions_private on public.sprint_customer_sessions for all to anon, authenticated using (false) with check (false);
drop policy if exists sprint_requests_private on public.sprint_requests;
create policy sprint_requests_private on public.sprint_requests for all to anon, authenticated using (false) with check (false);
drop policy if exists sprint_attachments_private on public.sprint_attachments;
create policy sprint_attachments_private on public.sprint_attachments for all to anon, authenticated using (false) with check (false);
drop policy if exists sprint_request_events_private on public.sprint_request_events;
create policy sprint_request_events_private on public.sprint_request_events for all to anon, authenticated using (false) with check (false);
