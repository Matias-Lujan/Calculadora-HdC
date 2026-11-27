-- The LibreLinkUp session of a user (spec §7.1, §9.8): the token the
-- glucose-latest function got at its last login, so it does not log in on
-- every call (Abbott locks the account after many logins), and the wait
-- after a failed login. One row per user. Only the Edge Function reads and
-- writes it, with the secret key; the app never sees it.

create table public.libre_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_url text,
  token text,
  account_id_hash text,
  expires_at timestamptz,
  -- After a failed login, no new login before this time, and its code.
  login_after timestamptz,
  login_error text,
  updated_at timestamptz not null default now(),
  -- A session has all four fields or none.
  constraint libre_sessions_session_complete check (
    (token is null) = (api_url is null)
    and (token is null) = (account_id_hash is null)
    and (token is null) = (expires_at is null)
  )
);

create trigger libre_sessions_set_updated_at
  before update on public.libre_sessions
  for each row execute function public.set_updated_at();

-- RLS on, with no policies on purpose: no user can read or write a row,
-- not even their own (it holds a token of their LibreLinkUp account). Only
-- the glucose-latest function uses the table, with the secret key
-- (service_role, which bypasses RLS).
alter table public.libre_sessions enable row level security;

-- Explicit privileges (tables are not exposed automatically).
revoke all on table public.libre_sessions from anon, authenticated, service_role;
grant select, insert, update on table public.libre_sessions to service_role;
