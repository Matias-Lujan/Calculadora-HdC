-- Log of label readings, used for the daily cap of the Edge Function
-- (spec §9.3). The function reads and inserts on behalf of the user.

create table public.vision_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null check (length(status) > 0)
);

create index vision_requests_user_created_idx
  on public.vision_requests (user_id, created_at desc);

-- RLS: own rows only. No update or delete, so the cap cannot be reset.
alter table public.vision_requests enable row level security;

create policy "vision_requests: select own"
  on public.vision_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "vision_requests: insert own"
  on public.vision_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.vision_requests from anon, authenticated;
grant select, insert on table public.vision_requests to authenticated;
