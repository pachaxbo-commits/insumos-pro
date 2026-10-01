import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultMenuLabels, menuKeys, type MenuKey } from "@/lib/app-appearance/model";

export type AppAppearance = {
  systemName: string;
  logoUrl: string | null;
  menuLabels: Record<MenuKey, string>;
};

const fallback: AppAppearance = {
  systemName: "QB Insumos",
  logoUrl: null,
  menuLabels: defaultMenuLabels,
};

export async function getAppAppearance(): Promise<AppAppearance> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fallback;
  const { data, error } = await supabase
    .from("qb_ui_settings")
    .select("system_name, logo_path, menu_labels")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return fallback;
  const configured = data.menu_labels && typeof data.menu_labels === "object" && !Array.isArray(data.menu_labels)
    ? data.menu_labels as Record<string, unknown> : {};
  const labels = { ...defaultMenuLabels };
  for (const key of menuKeys) {
    const value = configured[key];
    if (typeof value === "string" && value.trim().length > 0 && value.length <= 40) labels[key] = value.trim();
  }
  const logoUrl = typeof data.logo_path === "string" && data.logo_path.startsWith("branding/")
    ? supabase.storage.from("product-images").getPublicUrl(data.logo_path).data.publicUrl
    : null;
  return {
    systemName: typeof data.system_name === "string" && data.system_name.trim() ? data.system_name.trim() : fallback.systemName,
    logoUrl,
    menuLabels: labels,
  };
}
