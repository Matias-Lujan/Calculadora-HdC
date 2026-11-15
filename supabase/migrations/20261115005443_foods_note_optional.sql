-- The note of a manual food is no longer required (spec §6.3, §14 #49).
-- No table, policy or grant changes.
alter table public.foods drop constraint foods_manual_requires_note;
