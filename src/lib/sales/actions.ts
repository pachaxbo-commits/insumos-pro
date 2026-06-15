"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CUSTOMER_TYPES, SALE_PAYMENT_TYPES } from "@/types/sales";

type ActionState = {
  success: boolean;
  message?: string;
};

const customerManageRoles = new Set(["administrador", "ventas"]);
const salesManageRoles = new Set(["administrador", "ventas"]);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.email("Email invalido.").nullable(),
);

const customerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  business_name: optionalText,
  nit: optionalText,
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  customer_type: z.enum(CUSTOMER_TYPES),
  credit_limit: z.coerce.number().min(0, "El limite de credito no puede ser negativo."),
  current_balance: z.coerce.number().min(0, "El saldo actual no puede ser negativo."),
  is_active: z.coerce.boolean().default(true),
});

const saleSchema = z.object({
  customer_id: z.uuid("Selecciona un cliente."),
  sale_date: z.string().min(10, "Selecciona una fecha."),
  payment_type: z.enum(SALE_PAYMENT_TYPES),
  discount: z.coerce.number().min(0, "El descuento no puede ser negativo."),
  notes: optionalText,
});

async function assertRole(allowedRoles: Set<string>, deniedMessage: string) {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !allowedRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: deniedMessage,
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return { allowed: true as const, supabase, userId: auth.user.id };
}

function parseId(formData: FormData) {
  const id = formData.get("id");
  return typeof id === "string" ? id : "";
}

function parseSaleItems(formData: FormData) {
  const items: Array<{ product_id: string; quantity: number; unit_price: number }> = [];

  for (let index = 0; index < 10; index += 1) {
    const productId = formData.get(`item_product_id_${index}`);
    const quantity = formData.get(`item_quantity_${index}`);
    const unitPrice = formData.get(`item_unit_price_${index}`);

    if (!productId && !quantity && !unitPrice) continue;
    if (typeof productId !== "string" || !productId) continue;

    const parsed = z
      .object({
        product_id: z.uuid(),
        quantity: z.coerce.number().positive(),
        unit_price: z.coerce.number().min(0),
      })
      .safeParse({
        product_id: productId,
        quantity,
        unit_price: unitPrice,
      });

    if (parsed.success) items.push(parsed.data);
  }

  return items;
}

function revalidateSales() {
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  revalidatePath("/inventario");
  revalidatePath("/productos");
  revalidatePath("/");
}

function getBusinessErrorMessage(message: string | undefined) {
  if (!message) return "No se pudo completar la operacion.";

  if (message.includes("El cliente no esta habilitado para ventas a credito")) {
    return "Este cliente esta configurado como contado y no puede generar ventas a credito.";
  }

  if (message.includes("La venta supera el limite de credito")) {
    return "La venta supera el limite de credito disponible para este cliente.";
  }

  if (message.includes("Stock insuficiente")) {
    return "Stock insuficiente para confirmar la venta. Revisa las cantidades disponibles.";
  }

  if (message.includes("La venta ya fue confirmada")) {
    return "La venta ya fue confirmada y no puede confirmarse nuevamente.";
  }

  if (message.includes("Solo se pueden confirmar ventas en borrador")) {
    return "Esta venta ya no esta en borrador y no puede confirmarse.";
  }

  if (message.includes("Solo se pueden anular ventas en borrador")) {
    return "Esta venta ya no esta en borrador y no puede anularse desde este flujo.";
  }

  return message;
}

export async function createCustomerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(customerManageRoles, "Tu rol no permite crear clientes.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = customerSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el cliente." };
  }

  const { error } = await access.supabase.from("customers").insert(parsed.data);

  if (error) return { success: false, message: error.message };

  revalidateSales();
  return { success: true, message: "Cliente creado correctamente." };
}

export async function updateCustomerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(customerManageRoles, "Tu rol no permite editar clientes.");
  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));

  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Cliente invalido." };
  }

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el cliente." };
  }

  const { error } = await access.supabase.from("customers").update(parsed.data).eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSales();
  return { success: true, message: "Cliente actualizado correctamente." };
}

export async function deactivateCustomerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(customerManageRoles, "Tu rol no permite desactivar clientes.");
  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Cliente invalido." };
  }

  const { error } = await access.supabase.from("customers").update({ is_active: false }).eq("id", id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "deactivate_customer",
    entityType: "customer",
    entityId: id,
  });

  revalidateSales();
  return { success: true, message: "Cliente desactivado correctamente." };
}

export async function createSaleAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(salesManageRoles, "Tu rol no permite crear ventas.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = saleSchema.safeParse(Object.fromEntries(formData));
  const items = parseSaleItems(formData);

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la venta." };
  }

  if (!items.length) {
    return { success: false, message: "Agrega al menos un producto a la venta." };
  }

  const { data, error } = await access.supabase.rpc("create_sale_draft", {
    p_customer_id: parsed.data.customer_id,
    p_sale_date: parsed.data.sale_date,
    p_payment_type: parsed.data.payment_type,
    p_discount: parsed.data.discount,
    p_notes: parsed.data.notes,
    p_items: items,
  });

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_sale",
    entityType: "sale",
    entityId: typeof data === "string" ? data : null,
    metadata: {
      customer_id: parsed.data.customer_id,
      payment_type: parsed.data.payment_type,
      items_count: items.length,
      discount: parsed.data.discount,
    },
  });

  revalidateSales();
  return { success: true, message: "Venta guardada como borrador." };
}

export async function confirmSaleAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(salesManageRoles, "Tu rol no permite confirmar ventas.");
  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Venta invalida." };
  }

  const { error } = await access.supabase.rpc("confirm_sale", { p_sale_id: id });

  if (error) {
    return { success: false, message: getBusinessErrorMessage(error.message) };
  }

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "confirm_sale",
    entityType: "sale",
    entityId: id,
  });

  revalidateSales();
  return { success: true, message: "Venta confirmada correctamente." };
}

export async function cancelSaleAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertRole(salesManageRoles, "Tu rol no permite anular ventas.");
  if (!access.allowed) return { success: false, message: access.message };

  const id = parseId(formData);
  if (!z.uuid().safeParse(id).success) {
    return { success: false, message: "Venta invalida." };
  }

  const { error } = await access.supabase.rpc("cancel_sale_draft", { p_sale_id: id });

  if (error) {
    return { success: false, message: getBusinessErrorMessage(error.message) };
  }

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "cancel_sale",
    entityType: "sale",
    entityId: id,
  });

  revalidateSales();
  return { success: true, message: "Venta anulada correctamente." };
}
