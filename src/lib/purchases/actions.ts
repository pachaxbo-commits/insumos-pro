"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/types/purchases";

type ActionState = {
  success: boolean;
  message?: string;
};

const manageRoles = new Set(["administrador", "inventario"]);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const supplierSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  contact_name: optionalText,
  phone: optionalText,
  address: optionalText,
  notes: optionalText,
  is_active: z.coerce.boolean().default(true),
});

const purchaseSchema = z.object({
  supplier_id: z.uuid("Selecciona un proveedor."),
  purchase_date: z.string().min(10, "Selecciona una fecha."),
  payment_status: z.enum(PAYMENT_STATUSES),
  payment_method: z.enum(PAYMENT_METHODS),
  notes: optionalText,
});

async function assertCanManagePurchases() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !manageRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol solo permite lectura en compras.",
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return { allowed: true as const, supabase };
}

function parseId(formData: FormData) {
  const id = formData.get("id");
  return typeof id === "string" ? id : "";
}

function parsePurchaseItems(formData: FormData) {
  const items: Array<{ product_id: string; quantity: number; unit_cost: number }> = [];

  for (let index = 0; index < 8; index += 1) {
    const productId = formData.get(`item_product_id_${index}`);
    const quantity = formData.get(`item_quantity_${index}`);
    const unitCost = formData.get(`item_unit_cost_${index}`);

    if (!productId && !quantity && !unitCost) continue;
    if (typeof productId !== "string" || !productId) continue;

    const parsed = z
      .object({
        product_id: z.uuid(),
        quantity: z.coerce.number().positive(),
        unit_cost: z.coerce.number().min(0),
      })
      .safeParse({
        product_id: productId,
        quantity,
        unit_cost: unitCost,
      });

    if (parsed.success) items.push(parsed.data);
  }

  return items;
}

function revalidatePurchases() {
  revalidatePath("/compras");
  revalidatePath("/proveedores");
  revalidatePath("/inventario");
  revalidatePath("/productos");
}

export async function createSupplierAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el proveedor." };
  }

  const { error } = await access.supabase.from("suppliers").insert(parsed.data);

  if (error) return { success: false, message: error.message };

  revalidatePurchases();
  return { success: true, message: "Proveedor creado correctamente." };
}

export async function updateSupplierAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Proveedor invalido." };
  }

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el proveedor." };
  }

  const { error } = await access.supabase.from("suppliers").update(parsed.data).eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidatePurchases();
  return { success: true, message: "Proveedor actualizado correctamente." };
}

export async function deactivateSupplierAction(formData: FormData) {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return;

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) return;

  await access.supabase.from("suppliers").update({ is_active: false }).eq("id", id);
  revalidatePurchases();
}

export async function createPurchaseAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  const items = parsePurchaseItems(formData);

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la compra." };
  }

  if (!items.length) {
    return { success: false, message: "Agrega al menos un producto a la compra." };
  }

  const { error } = await access.supabase.rpc("create_purchase_draft", {
    p_supplier_id: parsed.data.supplier_id,
    p_purchase_date: parsed.data.purchase_date,
    p_payment_status: parsed.data.payment_status,
    p_payment_method: parsed.data.payment_method,
    p_notes: parsed.data.notes,
    p_items: items,
  });

  if (error) return { success: false, message: error.message };

  revalidatePurchases();
  return { success: true, message: "Compra guardada como borrador." };
}

export async function confirmPurchaseAction(formData: FormData) {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return;

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) return;

  await access.supabase.rpc("confirm_purchase", { p_purchase_id: id });
  revalidatePurchases();
}

export async function cancelPurchaseAction(formData: FormData) {
  const access = await assertCanManagePurchases();
  if (!access.allowed) return;

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) return;

  await access.supabase.rpc("cancel_purchase_draft", { p_purchase_id: id });
  revalidatePurchases();
}
