import { z } from "zod";

/**
 * Public environment (safe for the browser). Read lazily so a missing value
 * produces a clear message at request time instead of breaking the build.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.url({ message: "NEXT_PUBLIC_SITE_URL must be a URL" }).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class MissingConfigurationError extends Error {
  constructor(details: string) {
    super(
      `The website is not configured yet: ${details}. Copy .env.example to .env.local and fill in your Supabase project details.`,
    );
    this.name = "MissingConfigurationError";
  }
}

export function getPublicEnv(): PublicEnv {
  // Literal property access so Next.js can inline these into browser bundles.
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
  if (!result.success) {
    throw new MissingConfigurationError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

export function isSupabaseConfigured(): boolean {
  try {
    getPublicEnv();
    return true;
  } catch {
    return false;
  }
}
