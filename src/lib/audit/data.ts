import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/auth";
import type { AuditFilters, AuditLog } from "@/types/audit";

type AuditLogRow = Omit<AuditLog, "user">;
type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
};

export type AuditLogsData = {
  logs: AuditLog[];
  users: Array<{ id: string; label: string }>;
  summary: {
    total: number;
    today: number;
    critical: number;
  };
};

const criticalActions = new Set([
  "confirm_purchase",
  "confirm_sale",
  "register_customer_payment",
  "register_supplier_payment",
  "register_manual_cash_movement",
]);

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function todayRange() {
  return dayRange(new Date().toISOString().slice(0, 10));
}

export async function getAuditLogsData(filters: AuditFilters = {}): Promise<AuditLogsData> {
  noStore();

  const empty: AuditLogsData = {
    logs: [],
    users: [],
    summary: {
      total: 0,
      today: 0,
      critical: 0,
    },
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return empty;

  let logsQuery = supabase
    .from("audit_logs")
    .select("id, user_id, action, entity_type, entity_id, metadata, ip_address, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(150);

  if (filters.user && filters.user !== "all") {
    logsQuery = logsQuery.eq("user_id", filters.user);
  }

  if (filters.action && filters.action !== "all") {
    logsQuery = logsQuery.eq("action", filters.action);
  }

  if (filters.entity && filters.entity !== "all") {
    logsQuery = logsQuery.eq("entity_type", filters.entity);
  }

  if (filters.date) {
    const range = dayRange(filters.date);
    logsQuery = logsQuery.gte("created_at", range.start).lt("created_at", range.end);
  }

  const today = todayRange();
  const [logsResult, profilesResult, todayResult] = await Promise.all([
    logsQuery,
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .order("full_name", { ascending: true }),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.start)
      .lt("created_at", today.end),
  ]);

  if (logsResult.error) return empty;

  const profiles = profilesResult.error ? [] : ((profilesResult.data ?? []) as ProfileRow[]);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = (logsResult.data ?? []) as AuditLogRow[];
  const logs = rows.map((log) => ({
    ...log,
    metadata: log.metadata ?? {},
    user: log.user_id ? profilesById.get(log.user_id) ?? null : null,
  }));

  return {
    logs,
    users: profiles.map((profile) => ({
      id: profile.id,
      label: profile.full_name || profile.id.slice(0, 8),
    })),
    summary: {
      total: logs.length,
      today: todayResult.count ?? 0,
      critical: logs.filter((log) => criticalActions.has(log.action)).length,
    },
  };
}
