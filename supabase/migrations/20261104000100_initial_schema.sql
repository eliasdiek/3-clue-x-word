-- =============================================================================
-- 3-Clue X-Word — initial schema
--
-- Grid storage format (puzzles.grid_data):
--   A JSON array of exactly 12 strings, each exactly 12 characters long.
--   'A'-'Z' = a letter, '#' = an explicit black square, '.' = an empty cell.
--   Empty cells become black squares when the grid is finalised ("DONE"),
--   but are kept as '.' while composing so they are not blocked too early.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.admin_role as enum ('owner', 'admin');
create type public.puzzle_status as enum ('draft', 'ready', 'published', 'archived');
create type public.word_direction as enum ('across', 'down');

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Keeps updated_at current on every UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the value is a valid 12x12 grid in the storage format above.
create function public.is_valid_grid_data(grid jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(grid) = 'array'
     and jsonb_array_length(grid) = 12
     and not exists (
       select 1
       from jsonb_array_elements(grid) as row_value
       where jsonb_typeof(row_value) <> 'string'
          or (row_value #>> '{}') !~ '^[A-Z#.]{12}$'
     );
$$;

-- True when the value is a JSON array of [row, column] pairs inside a 12x12 board.
create function public.is_valid_cell_positions(positions jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(positions) = 'array'
     and jsonb_array_length(positions) between 2 and 12
     and not exists (
       select 1
       from jsonb_array_elements(positions) as cell
       where jsonb_typeof(cell) <> 'array'
          or jsonb_array_length(cell) <> 2
          or jsonb_typeof(cell -> 0) <> 'number'
          or jsonb_typeof(cell -> 1) <> 'number'
          or (cell ->> 0)::int not between 0 and 11
          or (cell ->> 1)::int not between 0 and 11
     );
$$;

create function public.empty_grid_data()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(repeat('.', 12)) from generate_series(1, 12);
$$;

-- ---------------------------------------------------------------------------
-- admin_profiles: which Supabase Auth users may use the admin website
-- ---------------------------------------------------------------------------
create table public.admin_profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 100),
  role          public.admin_role not null default 'admin',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

-- Security-definer helpers so RLS policies can check admin status without
-- recursing through admin_profiles' own policies.
create function public.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.admin_profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_admin_id() is not null;
$$;

-- ---------------------------------------------------------------------------
-- puzzles: one row per crossword (draft or published)
-- ---------------------------------------------------------------------------
create table public.puzzles (
  id             uuid primary key default gen_random_uuid(),
  puzzle_number  integer unique check (puzzle_number > 0),
  title          text check (title is null or char_length(title) <= 100),
  status         public.puzzle_status not null default 'draft',
  grid_size      smallint not null default 12 check (grid_size = 12),
  grid_data      jsonb not null default public.empty_grid_data()
                 check (public.is_valid_grid_data(grid_data)),
  -- Set when the administrator clicks DONE and words are extracted; cleared
  -- whenever the grid changes afterwards so stale word lists are detectable.
  grid_finalized_at timestamptz,
  version        integer not null default 1 check (version > 0),
  created_by     uuid references public.admin_profiles (id) on delete set null,
  updated_by     uuid references public.admin_profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  archived_at    timestamptz,
  constraint puzzles_published_has_number check (
    status not in ('published') or (puzzle_number is not null and published_at is not null)
  ),
  constraint puzzles_number_only_when_published check (
    puzzle_number is null or published_at is not null
  )
);

create index puzzles_status_updated_idx on public.puzzles (status, updated_at desc);
create index puzzles_updated_idx on public.puzzles (updated_at desc);

create trigger puzzles_set_updated_at
  before update on public.puzzles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- puzzle_words: words extracted from a puzzle's grid
-- ---------------------------------------------------------------------------
create table public.puzzle_words (
  id              uuid primary key default gen_random_uuid(),
  puzzle_id       uuid not null references public.puzzles (id) on delete cascade,
  clue_number     smallint not null check (clue_number between 1 and 144),
  direction       public.word_direction not null,
  answer          text not null check (answer ~ '^[A-Z]{2,12}$'),
  word_length     smallint not null check (word_length between 2 and 12),
  start_row       smallint not null check (start_row between 0 and 11),
  start_column    smallint not null check (start_column between 0 and 11),
  cell_positions  jsonb not null check (public.is_valid_cell_positions(cell_positions)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint puzzle_words_length_matches check (
    word_length = char_length(answer)
    and word_length = jsonb_array_length(cell_positions)
  ),
  constraint puzzle_words_unique_number unique (puzzle_id, clue_number, direction),
  constraint puzzle_words_unique_position unique (puzzle_id, direction, start_row, start_column)
);

create index puzzle_words_answer_idx on public.puzzle_words (answer);

create trigger puzzle_words_set_updated_at
  before update on public.puzzle_words
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- dictionary_words / dictionary_clue_sets: reusable library of past clues
-- ---------------------------------------------------------------------------
create table public.dictionary_words (
  id               uuid primary key default gen_random_uuid(),
  normalized_word  text not null unique check (normalized_word ~ '^[A-Z]{2,12}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger dictionary_words_set_updated_at
  before update on public.dictionary_words
  for each row execute function public.set_updated_at();

-- Clue text limits: the app enforces a configurable limit (initially 50).
-- The database enforces a generous hard ceiling so the limit can be raised
-- later without a migration.
create table public.dictionary_clue_sets (
  id                  uuid primary key default gen_random_uuid(),
  dictionary_word_id  uuid not null references public.dictionary_words (id) on delete cascade,
  harder_clue         text not null check (char_length(btrim(harder_clue)) between 1 and 200),
  medium_clue         text not null check (char_length(btrim(medium_clue)) between 1 and 200),
  easier_clue         text not null check (char_length(btrim(easier_clue)) between 1 and 200),
  source_puzzle_id    uuid references public.puzzles (id) on delete set null,
  created_by          uuid references public.admin_profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dictionary_clue_sets_unique unique (dictionary_word_id, harder_clue, medium_clue, easier_clue)
);

create index dictionary_clue_sets_word_idx on public.dictionary_clue_sets (dictionary_word_id);

create trigger dictionary_clue_sets_set_updated_at
  before update on public.dictionary_clue_sets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- puzzle_clues: the three clues for each word in a puzzle (draft working copy)
-- Empty strings are allowed so partial drafts can be saved.
-- ---------------------------------------------------------------------------
create table public.puzzle_clues (
  id                     uuid primary key default gen_random_uuid(),
  puzzle_word_id         uuid not null unique references public.puzzle_words (id) on delete cascade,
  harder_clue            text not null default '' check (char_length(harder_clue) <= 200),
  medium_clue            text not null default '' check (char_length(medium_clue) <= 200),
  easier_clue            text not null default '' check (char_length(easier_clue) <= 200),
  source_clue_set_id     uuid references public.dictionary_clue_sets (id) on delete set null,
  updated_by             uuid references public.admin_profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger puzzle_clues_set_updated_at
  before update on public.puzzle_clues
  for each row execute function public.set_updated_at();

-- Which puzzles used which dictionary word (and clue set). Drives
-- "Usage Count", "Last Used" and "View Usage History" in the dictionary.
create table public.dictionary_word_usages (
  id                  uuid primary key default gen_random_uuid(),
  dictionary_word_id  uuid not null references public.dictionary_words (id) on delete cascade,
  clue_set_id         uuid references public.dictionary_clue_sets (id) on delete set null,
  puzzle_id           uuid not null references public.puzzles (id) on delete cascade,
  puzzle_word_id      uuid references public.puzzle_words (id) on delete set null,
  used_at             timestamptz not null default now(),
  constraint dictionary_word_usages_unique unique (puzzle_id, puzzle_word_id)
);

create index dictionary_word_usages_word_idx on public.dictionary_word_usages (dictionary_word_id, used_at desc);

-- ---------------------------------------------------------------------------
-- puzzle_publications: immutable snapshots delivered to the mobile app
-- ---------------------------------------------------------------------------
create table public.puzzle_publications (
  id                   uuid primary key default gen_random_uuid(),
  puzzle_id            uuid not null references public.puzzles (id) on delete restrict,
  puzzle_number        integer not null check (puzzle_number > 0),
  publication_version  integer not null check (publication_version > 0),
  payload_schema       text not null default 'v1',
  payload_snapshot     jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  is_current           boolean not null default true,
  withdrawn_at         timestamptz,
  published_by         uuid references public.admin_profiles (id) on delete set null,
  published_at         timestamptz not null default now(),
  constraint puzzle_publications_unique_version unique (puzzle_id, publication_version)
);

-- Only one current snapshot per puzzle and per puzzle number.
create unique index puzzle_publications_current_puzzle_idx
  on public.puzzle_publications (puzzle_id) where is_current;
create unique index puzzle_publications_current_number_idx
  on public.puzzle_publications (puzzle_number) where is_current;

-- Snapshots are write-once: the payload of an existing version can never change.
create function public.prevent_publication_payload_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payload_snapshot is distinct from old.payload_snapshot
     or new.puzzle_id is distinct from old.puzzle_id
     or new.puzzle_number is distinct from old.puzzle_number
     or new.publication_version is distinct from old.publication_version then
    raise exception 'Published puzzle snapshots cannot be modified'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger puzzle_publications_immutable
  before update on public.puzzle_publications
  for each row execute function public.prevent_publication_payload_change();

-- Gapless, consecutive published puzzle numbers. A single counter row is
-- locked during publication, so concurrent publishes are serialised and a
-- rolled-back publish never burns a number (unlike a sequence).
create table public.puzzle_number_counter (
  id           boolean primary key default true check (id),
  last_number  integer not null default 0 check (last_number >= 0)
);

insert into public.puzzle_number_counter (id, last_number) values (true, 0);

-- ---------------------------------------------------------------------------
-- Published-puzzle protection: answers of a published puzzle are frozen.
-- ---------------------------------------------------------------------------
create function public.guard_published_puzzle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('published', 'archived') and old.published_at is not null then
      raise exception 'Published puzzles cannot be deleted; archive them instead'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status = 'published' or (old.status = 'archived' and old.published_at is not null) then
    if new.grid_data is distinct from old.grid_data then
      raise exception 'The grid of a published puzzle cannot be changed'
        using errcode = 'check_violation';
    end if;
    if new.puzzle_number is distinct from old.puzzle_number then
      raise exception 'A published puzzle number cannot be changed'
        using errcode = 'check_violation';
    end if;
    if new.status in ('draft', 'ready') then
      raise exception 'A published puzzle cannot return to draft'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger puzzles_guard_published
  before update or delete on public.puzzles
  for each row execute function public.guard_published_puzzle();

create function public.guard_published_children()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_puzzle_id uuid;
  v_published boolean;
begin
  if tg_table_name = 'puzzle_words' then
    v_puzzle_id := coalesce(new.puzzle_id, old.puzzle_id);
  else
    select w.puzzle_id into v_puzzle_id
    from public.puzzle_words w
    where w.id = coalesce(new.puzzle_word_id, old.puzzle_word_id);
  end if;

  select p.published_at is not null into v_published
  from public.puzzles p
  where p.id = v_puzzle_id;

  -- A cascade from deleting the parent is allowed (the parent guard already
  -- refuses to delete published puzzles).
  if coalesce(v_published, false) then
    raise exception 'Words and clues of a published puzzle are locked; its published snapshot is preserved'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger puzzle_words_guard_published
  before insert or update or delete on public.puzzle_words
  for each row execute function public.guard_published_children();

create trigger puzzle_clues_guard_published
  before insert or update or delete on public.puzzle_clues
  for each row execute function public.guard_published_children();

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
create table public.admin_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references public.admin_profiles (id) on delete set null,
  action         text not null check (char_length(action) between 1 and 100),
  resource_type  text not null check (char_length(resource_type) between 1 and 100),
  resource_id    uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_resource_idx on public.admin_audit_logs (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- daily_quotes: shown on the mobile app's opening screen
-- ---------------------------------------------------------------------------
create table public.daily_quotes (
  id          uuid primary key default gen_random_uuid(),
  quote_date  date not null unique,
  quote_text  text not null check (char_length(btrim(quote_text)) between 1 and 1000),
  author      text check (author is null or char_length(author) <= 200),
  commentary  text check (commentary is null or char_length(commentary) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger daily_quotes_set_updated_at
  before update on public.daily_quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- puzzle_summaries: dashboard figures computed from real data.
-- security_invoker so the caller's RLS applies.
-- ---------------------------------------------------------------------------
create view public.puzzle_summaries
with (security_invoker = true)
as
select
  p.id,
  p.puzzle_number,
  p.title,
  p.status,
  p.version,
  p.created_at,
  p.updated_at,
  p.published_at,
  p.grid_finalized_at,
  count(w.id)::int as word_count,
  count(c.id) filter (
    where btrim(c.harder_clue) <> ''
      and btrim(c.medium_clue) <> ''
      and btrim(c.easier_clue) <> ''
  )::int as completed_clue_count
from public.puzzles p
left join public.puzzle_words w on w.puzzle_id = p.id
left join public.puzzle_clues c on c.puzzle_word_id = w.id
group by p.id;
