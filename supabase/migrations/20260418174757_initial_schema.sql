-- Initial schema for Sous Chef per docs/design.md §6.
-- Four tables: profiles, recipes, ingredients, macro_logs.
-- RLS intentionally left disabled for hour-0 hardcoded-user path.
-- See .claude/memory/decisions.md.

create extension if not exists "pgcrypto";

create table public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    created_at timestamptz not null default now()
);

create table public.recipes (
    recipe_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    status text not null check (status in ('active', 'finalized')),
    recipe_name text,
    pending_clarification text,
    created_at timestamptz not null default now(),
    finalized_at timestamptz
);

create index recipes_user_id_idx on public.recipes(user_id);
create index recipes_status_idx on public.recipes(status);

create table public.ingredients (
    ingredient_id uuid primary key default gen_random_uuid(),
    recipe_id uuid not null references public.recipes(recipe_id) on delete cascade,
    name text not null,
    qty numeric,
    unit text,
    raw_phrase text not null,
    created_at timestamptz not null default now()
);

create index ingredients_recipe_id_idx on public.ingredients(recipe_id);

create table public.macro_logs (
    recipe_id uuid primary key references public.recipes(recipe_id) on delete cascade,
    calories numeric not null default 0,
    protein_g numeric not null default 0,
    fat_g numeric not null default 0,
    carbs_g numeric not null default 0,
    per_ingredient jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
