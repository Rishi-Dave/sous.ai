-- Track how long a cooking session took so the cookbook can display it.
-- Populated by /finalize; null for in-progress or legacy recipes.

alter table public.recipes
    add column cook_time_seconds integer;
