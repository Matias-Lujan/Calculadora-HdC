-- The user's food catalog (spec §3, §6, §7.1).

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  brand text,
  source text not null check (source in ('label', 'reference', 'manual')),
  state text not null check (state in ('as_eaten', 'raw_cooked')),
  -- Available carbs (fiber excluded) per 100 g, in the state given by `state`.
  carbs_per_100g numeric not null check (carbs_per_100g between 0 and 100),
  cooking_factor numeric check (cooking_factor > 0),
  unit_weight_g numeric check (unit_weight_g > 0),
  unit_label text,
  photo_path text,
  label_transcription jsonb,
  reference_db text check (reference_db in ('usda_fdc', 'argenfoods')),
  reference_code text,
  reference_description text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Target of the composite foreign key from meal_items.
  unique (id, user_id),
  -- A cooking factor only makes sense for foods eaten cooked (spec §7.1).
  constraint foods_factor_only_raw_cooked
    check (state = 'raw_cooked' or cooking_factor is null),
  constraint foods_reference_requires_source
    check (source <> 'reference' or (reference_db is not null and reference_code is not null)),
  constraint foods_manual_requires_note
    check (source <> 'manual' or length(trim(coalesce(notes, ''))) > 0)
);

create index foods_user_name_idx
  on public.foods (user_id, name)
  where archived_at is null;

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- RLS: each user sees and changes only their own foods. No delete policy:
-- foods are archived (archived_at), because meal records reference them.
alter table public.foods enable row level security;

create policy "foods: select own"
  on public.foods for select to authenticated
  using (user_id = (select auth.uid()));

create policy "foods: insert own"
  on public.foods for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "foods: update own"
  on public.foods for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.foods from anon, authenticated;
grant select, insert, update on table public.foods to authenticated;
