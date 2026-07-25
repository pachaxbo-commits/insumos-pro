import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type QbCustomerDirectoryFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
};

export type QbCustomerDirectoryRow = {
  id: string;
  businessName: string;
  responsibleName: string;
  email: string;
  phone: string | null;
  locationId: string | null;
  address: string | null;
  locationLabel: string | null;
  locationReference: string | null;
  isActive: boolean;
};

type LocationRow = {
  id: string;
  label: string;
  address: string;
  reference: string | null;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
};

type AccountRow = {
  id: string;
  business_name: string;
  responsible_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  locations?: LocationRow[] | null;
};

export async function getQbCustomerDirectory(
  filters: QbCustomerDirectoryFilters = {},
): Promise<{ customers: QbCustomerDirectoryRow[]; error?: string }> {
  noStore();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { customers: [], error: "Falta configurar Supabase." };
  }

  let query = supabase
    .from("customer_accounts")
    .select(
      "id,business_name,responsible_name,email,phone,is_active,locations:qb_customer_locations(id,label,address,reference,is_primary,is_active,sort_order)",
    )
    .order("business_name", { ascending: true });

  if (filters.q?.trim()) {
    const search = filters.q.trim().replaceAll("%", "");
    query = query.or(
      `business_name.ilike.%${search}%,responsible_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }
  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "inactive") query = query.eq("is_active", false);

  const { data, error } = await query;
  if (error) {
    return {
      customers: [],
      error: "No se pudo cargar el directorio operativo de clientes.",
    };
  }

  return {
    customers: ((data ?? []) as AccountRow[]).map((account) => {
      const location = (account.locations ?? [])
        .filter((item) => item.is_active)
        .sort(
          (left, right) =>
            Number(right.is_primary) - Number(left.is_primary) ||
            left.sort_order - right.sort_order,
        )[0];
      return {
        id: account.id,
        businessName: account.business_name,
        responsibleName: account.responsible_name,
        email: account.email,
        phone: account.phone,
        locationId: location?.id ?? null,
        address: location?.address ?? null,
        locationLabel: location?.label ?? null,
        locationReference: location?.reference ?? null,
        isActive: account.is_active,
      };
    }),
  };
}
