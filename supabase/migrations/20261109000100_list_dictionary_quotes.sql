-- =============================================================================
-- 3-Clue X-Word: puzzle list, clue dictionary, daily quotes (steps 4, 7, 9)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- puzzle_summaries: add title search support and a single "stage" column so
-- the list can filter by where each puzzle is in the workflow.
--   grid      - still building the grid (Done not clicked since last change)
--   clues     - grid finished, some words still need clues
--   ready     - every word has three clues
--   published - published (live in the app)
--   archived  - set aside (and, if it was published, withdrawn from the app)
-- New columns are added at the end, as CREATE OR REPLACE VIEW requires.
-- ---------------------------------------------------------------------------
create or replace view public.puzzle_summaries
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
  )::int as completed_clue_count,
  case
    when p.status = 'archived' then 'archived'
    when p.status = 'published' then 'published'
    when p.grid_finalized_at is null then 'grid'
    when count(w.id) = 0
      or count(c.id) filter (
           where btrim(c.harder_clue) <> '' and btrim(c.medium_clue) <> '' and btrim(c.easier_clue) <> ''
         ) < count(w.id) then 'clues'
    else 'ready'
  end as stage,
  p.archived_at
from public.puzzles p
left join public.puzzle_words w on w.puzzle_id = p.id
left join public.puzzle_clues c on c.puzzle_word_id = w.id
group by p.id;

-- ---------------------------------------------------------------------------
-- archive_puzzle / restore_puzzle
--
-- Archiving sets a puzzle aside. A published puzzle keeps its number, grid
-- and clues (they stay locked), but its snapshot is withdrawn so the app no
-- longer offers it. Restoring reverses that. SECURITY DEFINER because
-- administrators may not write to puzzle_publications directly; the function
-- checks the caller is an admin first.
-- ---------------------------------------------------------------------------
create function public.archive_puzzle(p_puzzle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := public.current_admin_id();
  v_puzzle   public.puzzles%rowtype;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can archive puzzles' using errcode = 'insufficient_privilege';
  end if;
  select * into v_puzzle from public.puzzles p where p.id = p_puzzle_id for update;
  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;
  if v_puzzle.status = 'archived' then
    return;
  end if;

  update public.puzzles p
  set status = 'archived', archived_at = now(), updated_by = v_admin_id
  where p.id = p_puzzle_id;

  update public.puzzle_publications pp
  set withdrawn_at = now()
  where pp.puzzle_id = p_puzzle_id and pp.is_current and pp.withdrawn_at is null;

  insert into public.admin_audit_logs (admin_id, action, resource_type, resource_id, metadata)
  values (v_admin_id, 'puzzle.archived', 'puzzle', p_puzzle_id,
          jsonb_build_object('wasPublished', v_puzzle.published_at is not null, 'puzzleNumber', v_puzzle.puzzle_number));
end;
$$;

create function public.restore_puzzle(p_puzzle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := public.current_admin_id();
  v_puzzle   public.puzzles%rowtype;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can restore puzzles' using errcode = 'insufficient_privilege';
  end if;
  select * into v_puzzle from public.puzzles p where p.id = p_puzzle_id for update;
  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;
  if v_puzzle.status <> 'archived' then
    return;
  end if;

  update public.puzzles p
  set status = case when p.published_at is not null then 'published'::public.puzzle_status else 'draft'::public.puzzle_status end,
      archived_at = null,
      updated_by = v_admin_id
  where p.id = p_puzzle_id;

  update public.puzzle_publications pp
  set withdrawn_at = null
  where pp.puzzle_id = p_puzzle_id and pp.is_current;

  insert into public.admin_audit_logs (admin_id, action, resource_type, resource_id, metadata)
  values (v_admin_id, 'puzzle.restored', 'puzzle', p_puzzle_id, '{}'::jsonb);
end;
$$;

revoke all on function public.archive_puzzle(uuid) from public, anon;
revoke all on function public.restore_puzzle(uuid) from public, anon;
grant execute on function public.archive_puzzle(uuid) to authenticated;
grant execute on function public.restore_puzzle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- duplicate_puzzle: a new draft with the same grid, words and clues.
-- The copy has no number and is never published until it goes through
-- review itself. SECURITY INVOKER: RLS applies.
-- ---------------------------------------------------------------------------
create function public.duplicate_puzzle(p_puzzle_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin_id uuid := public.current_admin_id();
  v_source   public.puzzles%rowtype;
  v_new_id   uuid;
  v_word     record;
  v_word_id  uuid;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can copy puzzles' using errcode = 'insufficient_privilege';
  end if;
  select * into v_source from public.puzzles p where p.id = p_puzzle_id;
  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;

  insert into public.puzzles (title, grid_data, grid_finalized_at, created_by, updated_by)
  values (
    left('Copy of ' || coalesce(v_source.title, case when v_source.puzzle_number is not null
                                                     then 'puzzle #' || v_source.puzzle_number
                                                     else 'draft' end), 100),
    v_source.grid_data,
    v_source.grid_finalized_at,
    v_admin_id,
    v_admin_id
  )
  returning id into v_new_id;

  for v_word in
    select w.*, c.harder_clue, c.medium_clue, c.easier_clue, c.source_clue_set_id
    from public.puzzle_words w
    left join public.puzzle_clues c on c.puzzle_word_id = w.id
    where w.puzzle_id = p_puzzle_id
  loop
    insert into public.puzzle_words (
      puzzle_id, clue_number, direction, answer, word_length, start_row, start_column, cell_positions
    ) values (
      v_new_id, v_word.clue_number, v_word.direction, v_word.answer, v_word.word_length,
      v_word.start_row, v_word.start_column, v_word.cell_positions
    )
    returning id into v_word_id;

    insert into public.puzzle_clues (puzzle_word_id, harder_clue, medium_clue, easier_clue, source_clue_set_id, updated_by)
    values (v_word_id, coalesce(v_word.harder_clue, ''), coalesce(v_word.medium_clue, ''),
            coalesce(v_word.easier_clue, ''), v_word.source_clue_set_id, v_admin_id);
  end loop;

  insert into public.admin_audit_logs (admin_id, action, resource_type, resource_id, metadata)
  values (v_admin_id, 'puzzle.duplicated', 'puzzle', v_new_id, jsonb_build_object('source', p_puzzle_id));

  return v_new_id;
end;
$$;

revoke all on function public.duplicate_puzzle(uuid) from public, anon;
grant execute on function public.duplicate_puzzle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- dictionary_word_summaries: one row per dictionary word for the Clue
-- Dictionary page (clue sets, times used, last used).
-- ---------------------------------------------------------------------------
create view public.dictionary_word_summaries
with (security_invoker = true)
as
select
  d.id,
  d.normalized_word,
  char_length(d.normalized_word)::int as word_length,
  (select count(*)::int from public.dictionary_clue_sets s where s.dictionary_word_id = d.id) as clue_set_count,
  (select count(*)::int from public.dictionary_word_usages u where u.dictionary_word_id = d.id) as usage_count,
  (select max(u.used_at) from public.dictionary_word_usages u where u.dictionary_word_id = d.id) as last_used_at,
  d.created_at
from public.dictionary_words d;

-- ---------------------------------------------------------------------------
-- Daily quotes: "today" depends on where the player is. The database clock
-- is UTC, so a player in Brisbane (UTC+10) would not see their morning quote
-- until 10am. Allow up to one day ahead of UTC (the furthest ahead any time
-- zone is); the API picks the date the app asks for.
-- ---------------------------------------------------------------------------
drop policy "Anyone reads released quotes" on public.daily_quotes;
create policy "Anyone reads released quotes" on public.daily_quotes
  for select to anon, authenticated
  using (quote_date <= current_date + 1);
