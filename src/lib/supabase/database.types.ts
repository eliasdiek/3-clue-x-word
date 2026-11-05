/**
 * Database types for supabase-js.
 *
 * Hand-written to match supabase/migrations. Once a Supabase project is
 * linked, run `npm run db:types` (writes database.generated.ts) and
 * compare it with these types; switch to the generated ones once they match.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;

export type AdminRole = "owner" | "admin";
export type PuzzleStatus = "draft" | "ready" | "published" | "archived";
export type WordDirection = "across" | "down";

type Table<Row, Required extends keyof Row, Optional extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Pick<Row, Optional>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type AdminProfileRow = {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PuzzleRow = {
  id: string;
  puzzle_number: number | null;
  title: string | null;
  status: PuzzleStatus;
  grid_size: number;
  grid_data: string[];
  grid_finalized_at: Timestamp | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  published_at: Timestamp | null;
  archived_at: Timestamp | null;
};

export type PuzzleWordRow = {
  id: string;
  puzzle_id: string;
  clue_number: number;
  direction: WordDirection;
  answer: string;
  word_length: number;
  start_row: number;
  start_column: number;
  cell_positions: [number, number][];
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PuzzleClueRow = {
  id: string;
  puzzle_word_id: string;
  harder_clue: string;
  medium_clue: string;
  easier_clue: string;
  source_clue_set_id: string | null;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type DictionaryWordRow = {
  id: string;
  normalized_word: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type DictionaryClueSetRow = {
  id: string;
  dictionary_word_id: string;
  harder_clue: string;
  medium_clue: string;
  easier_clue: string;
  source_puzzle_id: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type DictionaryWordUsageRow = {
  id: string;
  dictionary_word_id: string;
  clue_set_id: string | null;
  puzzle_id: string;
  puzzle_word_id: string | null;
  used_at: Timestamp;
};

export type PuzzlePublicationRow = {
  id: string;
  puzzle_id: string;
  puzzle_number: number;
  publication_version: number;
  payload_schema: string;
  payload_snapshot: Json;
  is_current: boolean;
  withdrawn_at: Timestamp | null;
  published_by: string | null;
  published_at: Timestamp;
};

export type AdminAuditLogRow = {
  id: string;
  admin_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Json;
  created_at: Timestamp;
};

export type DailyQuoteRow = {
  id: string;
  quote_date: string;
  quote_text: string;
  author: string | null;
  commentary: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PuzzleSummaryRow = {
  id: string;
  puzzle_number: number | null;
  title: string | null;
  status: PuzzleStatus;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  published_at: Timestamp | null;
  grid_finalized_at: Timestamp | null;
  word_count: number;
  completed_clue_count: number;
};

export type Database = {
  public: {
    Tables: {
      admin_profiles: Table<AdminProfileRow, "auth_user_id" | "display_name", "role" | "is_active">;
      puzzles: Table<
        PuzzleRow,
        never,
        "title" | "status" | "grid_data" | "grid_finalized_at" | "created_by" | "updated_by" | "archived_at"
      >;
      puzzle_words: Table<
        PuzzleWordRow,
        | "puzzle_id"
        | "clue_number"
        | "direction"
        | "answer"
        | "word_length"
        | "start_row"
        | "start_column"
        | "cell_positions"
      >;
      puzzle_clues: Table<
        PuzzleClueRow,
        "puzzle_word_id",
        "harder_clue" | "medium_clue" | "easier_clue" | "source_clue_set_id" | "updated_by"
      >;
      dictionary_words: Table<DictionaryWordRow, "normalized_word">;
      dictionary_clue_sets: Table<
        DictionaryClueSetRow,
        "dictionary_word_id" | "harder_clue" | "medium_clue" | "easier_clue",
        "source_puzzle_id" | "created_by"
      >;
      dictionary_word_usages: Table<
        DictionaryWordUsageRow,
        "dictionary_word_id" | "puzzle_id",
        "clue_set_id" | "puzzle_word_id" | "used_at"
      >;
      puzzle_publications: Table<PuzzlePublicationRow, never>;
      admin_audit_logs: Table<
        AdminAuditLogRow,
        "action" | "resource_type",
        "admin_id" | "resource_id" | "metadata"
      >;
      daily_quotes: Table<DailyQuoteRow, "quote_date" | "quote_text", "author" | "commentary">;
    };
    Views: {
      puzzle_summaries: { Row: PuzzleSummaryRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_admin_id: { Args: Record<string, never>; Returns: string | null };
      next_puzzle_number: { Args: Record<string, never>; Returns: number | null };
      finish_puzzle_grid: {
        Args: { p_puzzle_id: string; p_grid: Json; p_words: Json; p_expected_updated_at: string | null };
        Returns: { word_count: number; kept_clue_count: number; dropped_clue_count: number; updated_at: string }[];
      };
      publish_puzzle: {
        Args: { p_puzzle_id: string; p_payload: Json; p_expected_updated_at: string | null };
        Returns: { puzzle_number: number; publication_version: number; published_at: string }[];
      };
    };
    Enums: {
      admin_role: AdminRole;
      puzzle_status: PuzzleStatus;
      word_direction: WordDirection;
    };
    CompositeTypes: Record<string, never>;
  };
};
