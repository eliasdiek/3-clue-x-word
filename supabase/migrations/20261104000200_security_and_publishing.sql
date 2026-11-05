-- =============================================================================
-- 3-Clue X-Word — Row Level Security, grants and publishing functions
--
-- Access model:
--   * Admin data: only signed-in users with an active admin_profiles row.
--   * Public (mobile app) data: read-only access to current, non-withdrawn
--     publication snapshots and to daily quotes up to today. Nothing else.
--   * No client ever needs the service-role key.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.admin_profiles          enable row level security;
alter table public.puzzles                 enable row level security;
alter table public.puzzle_words            enable row level security;
alter table public.puzzle_clues            enable row level security;
alter table public.dictionary_words        enable row level security;
alter table public.dictionary_clue_sets    enable row level security;
alter table public.dictionary_word_usages  enable row level security;
alter table public.puzzle_publications     enable row level security;
alter table public.puzzle_number_counter   enable row level security;
alter table public.admin_audit_logs        enable row level security;
alter table public.daily_quotes            enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase grants broad defaults to anon/authenticated;
-- narrow them so RLS is a second line of defence, not the only one.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant select on public.puzzle_publications to anon;
grant select on public.daily_quotes to anon;

revoke all on public.puzzle_number_counter from authenticated;
revoke insert, update, delete on public.puzzle_publications from authenticated;
revoke update, delete on public.admin_audit_logs from authenticated;
revoke insert, update, delete on public.admin_profiles from authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_admin_id() to authenticated;
grant execute on function public.is_valid_grid_data(jsonb) to authenticated;
grant execute on function public.is_valid_cell_positions(jsonb) to authenticated;
grant execute on function public.empty_grid_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- admin_profiles: a user may read their own profile; admins may read all.
-- Profiles are created/changed only with the service role (see scripts/).
create policy "Users read own profile" on public.admin_profiles
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy "Admins read all profiles" on public.admin_profiles
  for select to authenticated
  using ((select public.is_admin()));

-- Full admin access to working data.
create policy "Admins manage puzzles" on public.puzzles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage puzzle words" on public.puzzle_words
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage puzzle clues" on public.puzzle_clues
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage dictionary words" on public.dictionary_words
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage dictionary clue sets" on public.dictionary_clue_sets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage dictionary usage" on public.dictionary_word_usages
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins manage daily quotes" on public.daily_quotes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Audit log: admins may read and append, never edit or delete.
create policy "Admins read audit log" on public.admin_audit_logs
  for select to authenticated
  using ((select public.is_admin()));

create policy "Admins append to audit log" on public.admin_audit_logs
  for insert to authenticated
  with check ((select public.is_admin()) and admin_id = (select public.current_admin_id()));

-- Publications: admins see every snapshot; everyone else sees only live ones.
create policy "Admins read publications" on public.puzzle_publications
  for select to authenticated
  using ((select public.is_admin()));

create policy "Anyone reads live publications" on public.puzzle_publications
  for select to anon, authenticated
  using (is_current and withdrawn_at is null);

-- Quotes: the public may read today's and earlier quotes, never future ones.
create policy "Anyone reads released quotes" on public.daily_quotes
  for select to anon, authenticated
  using (quote_date <= current_date);

-- ---------------------------------------------------------------------------
-- publish_puzzle: the only way a puzzle becomes published.
--
-- Runs as one transaction:
--   1. verifies the caller is an admin,
--   2. locks the puzzle row and re-checks it has not changed since the
--      caller validated it (optimistic concurrency via updated_at),
--   3. verifies every word has three non-blank clues,
--   4. allocates the next consecutive puzzle number under a row lock,
--   5. stores an immutable snapshot and marks the puzzle published,
--   6. copies its words and clues into the reusable dictionary,
--   7. writes an audit log entry.
--
-- p_payload is the snapshot built by the shared TypeScript code
-- (createPublishedPuzzlePayload); the server stamps the number, version,
-- puzzle id and publication date into it here so they cannot disagree.
-- ---------------------------------------------------------------------------
create function public.publish_puzzle(
  p_puzzle_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz
)
returns table (
  puzzle_number integer,
  publication_version integer,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id    uuid := public.current_admin_id();
  v_puzzle      public.puzzles%rowtype;
  v_word_count  integer;
  v_incomplete  integer;
  v_number      integer;
  v_now         timestamptz := now();
  v_payload     jsonb;
  v_word        record;
  v_dict_id     uuid;
  v_set_id      uuid;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can publish puzzles'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A puzzle payload object is required'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_puzzle
  from public.puzzles p
  where p.id = p_puzzle_id
  for update;

  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;

  if v_puzzle.status = 'published' or v_puzzle.published_at is not null then
    raise exception 'This puzzle has already been published as #%', v_puzzle.puzzle_number
      using errcode = 'unique_violation';
  end if;

  if v_puzzle.status = 'archived' then
    raise exception 'Archived puzzles cannot be published'
      using errcode = 'check_violation';
  end if;

  if p_expected_updated_at is not null
     and v_puzzle.updated_at <> p_expected_updated_at then
    raise exception 'The puzzle was changed after it was checked. Please review it again.'
      using errcode = 'serialization_failure';
  end if;

  if v_puzzle.grid_finalized_at is null then
    raise exception 'The grid has not been finished (DONE) yet'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_word_count
  from public.puzzle_words w
  where w.puzzle_id = p_puzzle_id;

  if v_word_count = 0 then
    raise exception 'The puzzle has no words' using errcode = 'check_violation';
  end if;

  select count(*) into v_incomplete
  from public.puzzle_words w
  left join public.puzzle_clues c on c.puzzle_word_id = w.id
  where w.puzzle_id = p_puzzle_id
    and (
      c.id is null
      or btrim(c.harder_clue) = ''
      or btrim(c.medium_clue) = ''
      or btrim(c.easier_clue) = ''
    );

  if v_incomplete > 0 then
    raise exception '% word(s) are missing one or more clues', v_incomplete
      using errcode = 'check_violation';
  end if;

  -- Allocate the next consecutive number. The row lock serialises publishers.
  update public.puzzle_number_counter c
  set last_number = c.last_number + 1
  where c.id
  returning c.last_number into v_number;

  v_payload := p_payload || jsonb_build_object(
    'puzzleId', p_puzzle_id,
    'puzzleNumber', v_number,
    'version', 1,
    'publishedAt', to_jsonb(v_now)
  );

  insert into public.puzzle_publications (
    puzzle_id, puzzle_number, publication_version, payload_snapshot,
    is_current, published_by, published_at
  ) values (
    p_puzzle_id, v_number, 1, v_payload, true, v_admin_id, v_now
  );

  update public.puzzles p
  set status = 'published',
      puzzle_number = v_number,
      published_at = v_now,
      updated_by = v_admin_id
  where p.id = p_puzzle_id;

  -- Feed the reusable dictionary: one word row per answer, one clue set per
  -- distinct trio of clues, and a usage record per puzzle position.
  for v_word in
    select w.id as word_id, w.answer, btrim(c.harder_clue) as harder,
           btrim(c.medium_clue) as medium, btrim(c.easier_clue) as easier
    from public.puzzle_words w
    join public.puzzle_clues c on c.puzzle_word_id = w.id
    where w.puzzle_id = p_puzzle_id
  loop
    insert into public.dictionary_words (normalized_word)
    values (v_word.answer)
    on conflict (normalized_word) do update set updated_at = now()
    returning id into v_dict_id;

    insert into public.dictionary_clue_sets (
      dictionary_word_id, harder_clue, medium_clue, easier_clue,
      source_puzzle_id, created_by
    ) values (
      v_dict_id, v_word.harder, v_word.medium, v_word.easier,
      p_puzzle_id, v_admin_id
    )
    on conflict on constraint dictionary_clue_sets_unique
      do update set updated_at = now()
    returning id into v_set_id;

    insert into public.dictionary_word_usages (
      dictionary_word_id, clue_set_id, puzzle_id, puzzle_word_id, used_at
    ) values (
      v_dict_id, v_set_id, p_puzzle_id, v_word.word_id, v_now
    )
    on conflict on constraint dictionary_word_usages_unique do nothing;
  end loop;

  insert into public.admin_audit_logs (admin_id, action, resource_type, resource_id, metadata)
  values (
    v_admin_id, 'puzzle.published', 'puzzle', p_puzzle_id,
    jsonb_build_object('puzzleNumber', v_number, 'wordCount', v_word_count)
  );

  return query select v_number, 1, v_now;
end;
$$;

revoke all on function public.publish_puzzle(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.publish_puzzle(uuid, jsonb, timestamptz) to authenticated;

-- Read-only helper for the dashboard: the number the next publish will get.
-- Informational only; the real number is allocated inside publish_puzzle.
create function public.next_puzzle_number()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_admin()
              then (select last_number + 1 from public.puzzle_number_counter where id)
         end;
$$;

revoke all on function public.next_puzzle_number() from public, anon;
grant execute on function public.next_puzzle_number() to authenticated;
