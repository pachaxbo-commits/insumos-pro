import type { ProductWithRelations } from "@/types/products";
import type { Profile } from "@/types/auth";

export const INVENTORY_MOVEMENT_TYPES = [
  "entrada",
  "salida",
  "ajuste",
  "merma",
  "devolucion",
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type InventoryMovement = {
  id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type InventoryMovementWithRelations = InventoryMovement & {
  product: ProductWithRelations | null;
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type InventoryFilters = {
  product?: string;
  type?: InventoryMovementType | "all";
  date?: string;
};

export type InventorySummary = {
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  movementsToday: number;
};
