/**
 * Creates (or promotes) an administrator account.
 *
 *   npm run admin:create -- --email john@example.com --name "John Ward" [--role owner]
 *
 * The password is read from the ADMIN_PASSWORD environment variable, or a
 * strong one is generated and printed once. Requires SUPABASE_SERVICE_ROLE_KEY
 * in .env.local — this key is only ever used by this local script, never by
 * the website.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"], quiet: true });

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
  },
});

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
if (!values.email || !values.name) fail('Usage: npm run admin:create -- --email you@example.com --name "Your Name"');
if (values.role !== "owner" && values.role !== "admin") fail("--role must be owner or admin");

const email = values.email.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || randomBytes(15).toString("base64url");
const generated = !process.env.ADMIN_PASSWORD;

/** Retries network-level failures (slow or flaky connections), not HTTP errors. */
const retryingFetch: typeof fetch = async (input, init) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (attempt >= 4) throw error;
      console.log(`  (network problem, retrying ${attempt}/3…)`);
    }
  }
};

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retryingFetch },
});

async function findUserId(): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  let userId = await findUserId();
  if (userId) {
    console.log(`• ${email} already has a login; granting admin access.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) fail(`Could not create the login: ${error?.message}`);
    userId = data.user.id;
    console.log(`• Created login for ${email}.`);
  }

  const { error } = await supabase
    .from("admin_profiles")
    .upsert(
      { auth_user_id: userId, display_name: values.name!.trim(), role: values.role, is_active: true },
      { onConflict: "auth_user_id" },
    );
  if (error) fail(`Could not save the admin profile: ${error.message}`);

  console.log(`✔ ${values.name} (${email}) is now an ${values.role === "owner" ? "owner" : "administrator"}.`);
  if (generated && userId) {
    console.log(`\n  Temporary password: ${password}\n  Ask them to change it under Settings after logging in.\n`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
