import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Appends an entry to admin_audit_logs. Auditing must never block the action
 * being audited, so failures are logged to the server console only.
 */
export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  entry: {
    adminId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, Json>;
  },
) {
  const { error } = await supabase.from("admin_audit_logs").insert({
    admin_id: entry.adminId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) console.error("[audit] failed to record", entry.action, error.message);
}
