-- =============================================================================
-- 3-Clue X-Word: grid editor (build step 5)
--
--   * created_by / updated_by default to the signed-in administrator.
--   * finish_puzzle_grid(): the server side of the editor's "Done" button.
-- =============================================================================

alter table public.puzzles alter column created_by set default public.current_admin_id();
alter table public.puzzles alter column updated_by set default public.current_admin_id();

-- ---------------------------------------------------------------------------
-- finish_puzzle_grid
--
-- Called when the administrator clicks "Done" on the grid. In one transaction:
--   1. checks the caller is an admin and the puzzle is an unpublished draft
--      that has not changed since the editor loaded it (optimistic locking),
--   2. turns every square without a letter into a black square,
--   3. verifies the submitted word list exactly matches the grid: every word
--      is a complete run of letters, every run of 2+ letters is present once,
--      and numbering follows the specification (left to right, top to bottom),
--   4. replaces the puzzle's words, carrying existing clues over to the same
--      word (same direction, start square and answer; failing that, the same
--      direction and answer), and gives every word a clue row,
--   5. writes an audit entry.
--
-- The word list is computed by the shared TypeScript engine
-- (src/lib/puzzle/grid.ts); this function never trusts it blindly.
-- SECURITY INVOKER: Row Level Security applies to everything it touches.
-- ---------------------------------------------------------------------------
create function public.finish_puzzle_grid(
  p_puzzle_id uuid,
  p_grid jsonb,
  p_words jsonb,
  p_expected_updated_at timestamptz
)
returns table (
  word_count integer,
  kept_clue_count integer,
  dropped_clue_count integer,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id   uuid := public.current_admin_id();
  v_puzzle     public.puzzles%rowtype;
  v_grid       jsonb;
  v_rows       text[];
  v_word       jsonb;
  v_old        jsonb;
  v_old_count  integer;
  v_used       boolean[];
  v_match      integer[];
  v_new_count  integer;
  v_kept       integer := 0;
  v_word_id    uuid;
  v_dir        text;
  v_answer     text;
  v_row        integer;
  v_col        integer;
  v_len        integer;
  v_dr         integer;
  v_dc         integer;
  v_runs       integer;
  v_updated_at timestamptz;
  i            integer;
  j            integer;
  k            integer;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can edit puzzles' using errcode = 'insufficient_privilege';
  end if;

  select * into v_puzzle from public.puzzles p where p.id = p_puzzle_id for update;
  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;
  if v_puzzle.published_at is not null or v_puzzle.status in ('published', 'archived') then
    raise exception 'Published and archived puzzles cannot be changed' using errcode = 'check_violation';
  end if;
  if p_expected_updated_at is not null and v_puzzle.updated_at <> p_expected_updated_at then
    raise exception 'The puzzle was changed somewhere else. Reload the page to see the latest version.'
      using errcode = 'serialization_failure';
  end if;

  -- 2. Black squares: anything that is not a letter.
  if not public.is_valid_grid_data(p_grid) then
    raise exception 'The grid is not a valid 12×12 grid' using errcode = 'invalid_parameter_value';
  end if;
  select array_agg(translate(r.value #>> '{}', '.', '#') order by r.ordinality)
    into v_rows
  from jsonb_array_elements(p_grid) with ordinality as r(value, ordinality);
  v_grid := to_jsonb(v_rows);

  -- 3. Verify the word list against the grid.
  if p_words is null or jsonb_typeof(p_words) <> 'array' or jsonb_array_length(p_words) = 0 then
    raise exception 'The grid has no words' using errcode = 'check_violation';
  end if;
  v_new_count := jsonb_array_length(p_words);

  for i in 0 .. v_new_count - 1 loop
    v_word := p_words -> i;
    v_dir := v_word ->> 'direction';
    v_answer := v_word ->> 'answer';
    v_row := (v_word ->> 'startRow')::int;
    v_col := (v_word ->> 'startColumn')::int;
    if v_dir not in ('across', 'down') or v_answer !~ '^[A-Z]{2,12}$'
       or v_row not between 0 and 11 or v_col not between 0 and 11 then
      raise exception 'Word % is not valid', i + 1 using errcode = 'invalid_parameter_value';
    end if;
    v_len := char_length(v_answer);
    v_dr := case when v_dir = 'down' then 1 else 0 end;
    v_dc := case when v_dir = 'across' then 1 else 0 end;

    -- The square before the word and the square after it must not be letters.
    if v_row - v_dr >= 0 and v_col - v_dc >= 0
       and substr(v_rows[v_row - v_dr + 1], v_col - v_dc + 1, 1) ~ '[A-Z]' then
      raise exception 'Word % does not start where the grid says it should', v_answer
        using errcode = 'check_violation';
    end if;
    if v_row + v_dr * v_len <= 11 and v_col + v_dc * v_len <= 11
       and substr(v_rows[v_row + v_dr * v_len + 1], v_col + v_dc * v_len + 1, 1) ~ '[A-Z]' then
      raise exception 'Word % does not end where the grid says it should', v_answer
        using errcode = 'check_violation';
    end if;
    -- Every letter must match the grid.
    for k in 0 .. v_len - 1 loop
      if v_row + v_dr * k > 11 or v_col + v_dc * k > 11
         or substr(v_rows[v_row + v_dr * k + 1], v_col + v_dc * k + 1, 1) <> substr(v_answer, k + 1, 1) then
        raise exception 'Word % does not match the letters in the grid', v_answer
          using errcode = 'check_violation';
      end if;
    end loop;
  end loop;

  -- Every run of 2+ letters must be listed exactly once: count the words the
  -- grid contains (one per direction at each start square) and compare.
  select count(*) into v_runs
  from generate_series(0, 11) as r(n), generate_series(0, 11) as c(n), (values ('across'), ('down')) as d(dir)
  where substr(v_rows[r.n + 1], c.n + 1, 1) ~ '[A-Z]'
    and case d.dir
      when 'across' then (c.n = 0 or substr(v_rows[r.n + 1], c.n, 1) !~ '[A-Z]')
                         and c.n < 11 and substr(v_rows[r.n + 1], c.n + 2, 1) ~ '[A-Z]'
      else (r.n = 0 or substr(v_rows[r.n], c.n + 1, 1) !~ '[A-Z]')
           and r.n < 11 and substr(v_rows[r.n + 2], c.n + 1, 1) ~ '[A-Z]'
    end;

  if v_runs <> v_new_count
     or (select count(distinct (w ->> 'direction', w ->> 'startRow', w ->> 'startColumn'))
         from jsonb_array_elements(p_words) as w) <> v_new_count then
    raise exception 'The word list does not match the grid. Please click Done again.'
      using errcode = 'check_violation';
  end if;

  -- Numbering: start squares get 1, 2, 3 ... left to right, top to bottom.
  if exists (
    select 1
    from (
      select (w ->> 'number')::int as number,
             dense_rank() over (order by (w ->> 'startRow')::int, (w ->> 'startColumn')::int) as expected
      from jsonb_array_elements(p_words) as w
    ) s
    where s.number is distinct from s.expected
  ) then
    raise exception 'The word numbers do not follow the grid. Please click Done again.'
      using errcode = 'check_violation';
  end if;

  -- 4. Carry clues over. Old words that have any clue text are candidates.
  select coalesce(jsonb_agg(jsonb_build_object(
           'direction', w.direction, 'answer', w.answer,
           'startRow', w.start_row, 'startColumn', w.start_column,
           'harder', c.harder_clue, 'medium', c.medium_clue, 'easier', c.easier_clue,
           'source', c.source_clue_set_id) order by w.direction, w.clue_number), '[]'::jsonb)
    into v_old
  from public.puzzle_words w
  join public.puzzle_clues c on c.puzzle_word_id = w.id
  where w.puzzle_id = p_puzzle_id
    and (btrim(c.harder_clue) <> '' or btrim(c.medium_clue) <> '' or btrim(c.easier_clue) <> '');
  v_old_count := jsonb_array_length(v_old);
  v_used := array_fill(false, array[greatest(v_old_count, 1)]);
  v_match := array_fill(null::integer, array[v_new_count]);

  -- Pass 1: same direction, start square and answer.
  for i in 0 .. v_new_count - 1 loop
    for j in 0 .. v_old_count - 1 loop
      if not v_used[j + 1]
         and v_old -> j ->> 'direction' = p_words -> i ->> 'direction'
         and v_old -> j ->> 'answer' = p_words -> i ->> 'answer'
         and (v_old -> j ->> 'startRow')::int = (p_words -> i ->> 'startRow')::int
         and (v_old -> j ->> 'startColumn')::int = (p_words -> i ->> 'startColumn')::int then
        v_used[j + 1] := true;
        v_match[i + 1] := j;
        exit;
      end if;
    end loop;
  end loop;

  -- Pass 2: the word moved; same direction and answer.
  for i in 0 .. v_new_count - 1 loop
    continue when v_match[i + 1] is not null;
    for j in 0 .. v_old_count - 1 loop
      if not v_used[j + 1]
         and v_old -> j ->> 'direction' = p_words -> i ->> 'direction'
         and v_old -> j ->> 'answer' = p_words -> i ->> 'answer' then
        v_used[j + 1] := true;
        v_match[i + 1] := j;
        exit;
      end if;
    end loop;
  end loop;

  delete from public.puzzle_words w where w.puzzle_id = p_puzzle_id;

  for i in 0 .. v_new_count - 1 loop
    v_word := p_words -> i;
    v_len := char_length(v_word ->> 'answer');
    v_dr := case when v_word ->> 'direction' = 'down' then 1 else 0 end;
    v_dc := case when v_word ->> 'direction' = 'across' then 1 else 0 end;

    insert into public.puzzle_words (
      puzzle_id, clue_number, direction, answer, word_length, start_row, start_column, cell_positions
    ) values (
      p_puzzle_id,
      (v_word ->> 'number')::int,
      (v_word ->> 'direction')::public.word_direction,
      v_word ->> 'answer',
      v_len,
      (v_word ->> 'startRow')::int,
      (v_word ->> 'startColumn')::int,
      (select jsonb_agg(jsonb_build_array(
                (v_word ->> 'startRow')::int + v_dr * k2,
                (v_word ->> 'startColumn')::int + v_dc * k2) order by k2)
         from generate_series(0, v_len - 1) as k2)
    )
    returning id into v_word_id;

    if v_match[i + 1] is not null then
      j := v_match[i + 1];
      insert into public.puzzle_clues (puzzle_word_id, harder_clue, medium_clue, easier_clue, source_clue_set_id, updated_by)
      values (v_word_id, v_old -> j ->> 'harder', v_old -> j ->> 'medium', v_old -> j ->> 'easier',
              (v_old -> j ->> 'source')::uuid, v_admin_id);
      v_kept := v_kept + 1;
    else
      insert into public.puzzle_clues (puzzle_word_id, updated_by) values (v_word_id, v_admin_id);
    end if;
  end loop;

  update public.puzzles p
  set grid_data = v_grid,
      grid_finalized_at = now(),
      status = 'draft',
      updated_by = v_admin_id
  where p.id = p_puzzle_id
  returning p.updated_at into v_updated_at;

  insert into public.admin_audit_logs (admin_id, action, resource_type, resource_id, metadata)
  values (v_admin_id, 'puzzle.grid_finished', 'puzzle', p_puzzle_id,
          jsonb_build_object('wordCount', v_new_count, 'keptClues', v_kept,
                             'droppedClues', v_old_count - v_kept));

  return query select v_new_count, v_kept, v_old_count - v_kept, v_updated_at;
end;
$$;

revoke all on function public.finish_puzzle_grid(uuid, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.finish_puzzle_grid(uuid, jsonb, jsonb, timestamptz) to authenticated;
