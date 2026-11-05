/**
 * Runs the real Supabase migrations against an in-process Postgres (PGlite)
 * with a minimal stand-in for Supabase's `auth` schema and roles, so schema
 * constraints, RLS policies and SQL functions can be tested without Docker.
 *
 * Limits: PGlite is a single connection, so true concurrent publishing cannot
 * be exercised here — numbering safety relies on the row lock in
 * publish_puzzle(), which is verified on a real Supabase database separately.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- Mirror Supabase's broad default grants; the migrations narrow them.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** Creates an auth user, optionally with an admin profile. Returns the auth user id. */
export async function createUser(
  db: PGlite,
  email: string,
  options: { admin?: boolean; active?: boolean; name?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  const id = rows[0].id;
  if (options.admin) {
    await db.query(
      "insert into public.admin_profiles (auth_user_id, display_name, role, is_active) values ($1, $2, 'owner', $3)",
      [id, options.name ?? email, options.active ?? true],
    );
  }
  return id;
}

type Role = "anon" | "authenticated";

/**
 * Runs `fn` inside a transaction as the given Postgres role, with the JWT
 * subject set the way PostgREST does. The transaction is committed unless
 * `fn` throws.
 */
export async function asRole<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
