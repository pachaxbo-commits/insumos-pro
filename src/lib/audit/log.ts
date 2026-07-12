import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuditAction, AuditEntityType } from "@/types/audit";

type AuditInput = {
  supabase: SupabaseClient;
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

function cleanMetadata(metadata: Record<string, unknown> = {}) {
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}

export async function writeAuditLog({
  userId,
  action,
  entityType,
  entityId,
  metadata,
}: AuditInput) {
  try {
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) return;

    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || headerStore.get("x-real-ip");
    const userAgent = headerStore.get("user-agent");

    await adminClient.from("audit_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata: cleanMetadata(metadata),
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch {
    // Audit logging must never block the primary business operation.
  }
}
