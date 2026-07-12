"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PURCHASE_BATCH_PAYMENT_METHODS } from "@/types/purchase-batches";

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

const batchSchema = z.object({
  batch_date: z.string().min(10, "Selecciona una fecha."),
  notes: optionalText,
});

const lineSchema = z.object({
  batch_id: z.uuid("Borrador invalido."),
  product_id: z.uuid("Selecciona un producto."),
  supplier_id: z.uuid("Selecciona un proveedor."),
  quantity: z.coerce
    .number()
    .finite("La cantidad debe ser valida.")
    .positive("La cantidad debe ser mayor a cero."),
  unit_cost: z.coerce
    .number()
    .finite("El costo unitario debe ser valido.")
    .min(0, "El costo unitario no puede ser negativo."),
  payment_method: z.enum(PURCHASE_BATCH_PAYMENT_METHODS),
  notes: optionalText,
});

const updateLineSchema = lineSchema.extend({
  id: z.uuid("Linea invalida."),
});

const deleteLineSchema = z.object({
  id: z.uuid("Linea invalida."),
});

const confirmBatchSchema = z.object({
  id: z.uuid("Borrador invalido."),
  confirmation: z.literal("CONFIRMAR", {
    error: "Escribe CONFIRMAR para ejecutar la compra multiple.",
  }),
});

const classificationSchema = z.object({
  line_id: z.uuid("Linea invalida."),
  waste_quantity: z.coerce
    .number()
    .finite("La merma debe ser una cantidad valida.")
    .min(0, "La merma no puede ser negativa."),
  notes: optionalText,
});

const classificationResultSchema = z.object({
  product_id: z.uuid("Selecciona un producto resultante."),
  quantity: z.coerce
    .number()
    .finite("La cantidad debe ser valida.")
    .positive("La cantidad debe ser mayor a cero."),
  assigned_cost: z.coerce
    .number()
    .finite("El costo asignado debe ser valido.")
    .min(0, "El costo asignado no puede ser negativo.")
    .optional(),
});

async function assertCanManageBatches() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !manageRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol solo permite lectura en compras multiples.",
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

function revalidatePurchaseBatches() {
  revalidatePath("/");
  revalidatePath("/compras");
  revalidatePath("/compras/multiple");
  revalidatePath("/inventario");
  revalidatePath("/finanzas");
  revalidatePath("/reportes");
}

function purchaseBatchBusinessMessage(message?: string) {
  if (!message) return "No se pudo completar la compra multiple.";

  if (message.includes("requiere clasificacion")) {
    return "Este producto requiere clasificacion de ingreso antes de confirmar.";
  }

  if (message.includes("ya fue confirmada")) {
    return "La compra multiple ya fue confirmada y no puede confirmarse nuevamente.";
  }

  if (message.includes("lineas incompletas") || message.includes("invalidas")) {
    return "La compra multiple tiene lineas incompletas o invalidas.";
  }

  if (message.includes("debe tener al menos una linea")) {
    return "Agrega al menos una linea antes de confirmar.";
  }

  if (message.includes("No tienes permisos")) {
    return "Tu rol no permite confirmar compras multiples.";
  }

  return message;
}

function classificationBusinessMessage(message?: string) {
  if (!message) return "No se pudo guardar la clasificacion.";

  if (message.includes("precio de venta valido")) {
    return "Un producto resultante no tiene precio de venta valido. Asigna costos manualmente.";
  }

  if (message.includes("costos asignados")) {
    return "Los costos asignados deben sumar exactamente el subtotal original.";
  }

  if (message.includes("producto base")) {
    return "El producto base no puede ser un producto resultante.";
  }

  if (message.includes("cantidad clasificada")) {
    return "La cantidad clasificada mas merma debe coincidir con la cantidad original cuando usan la misma unidad.";
  }

  return message;
}

function parseClassificationResults(formData: FormData) {
  const results: Array<z.infer<typeof classificationResultSchema>> = [];
  const parsedCount = z.coerce.number().int().min(1).max(25).safeParse(formData.get("result_count"));

  if (!parsedCount.success) {
    return {
      success: false as const,
      message: "La clasificacion tiene una cantidad de filas invalida.",
    };
  }

  for (let index = 0; index < parsedCount.data; index += 1) {
    const productId = formData.get(`result_product_id_${index}`);
    const quantity = formData.get(`result_quantity_${index}`);
    const assignedCost = formData.get(`result_assigned_cost_${index}`);

    if (!productId && !quantity && !assignedCost) continue;

    const parsed = classificationResultSchema.safeParse({
      product_id: productId,
      quantity,
      assigned_cost:
        typeof assignedCost === "string" && assignedCost.trim() !== ""
          ? assignedCost
          : undefined,
    });

    if (!parsed.success) {
      return {
        success: false as const,
        message: `Fila ${index + 1}: ${parsed.error.issues[0]?.message ?? "revisa los datos."}`,
      };
    }

    results.push(parsed.data);
  }

  if (!results.length) {
    return {
      success: false as const,
      message:
        "Agrega al menos un producto resultante. La clasificacion con 100% de merma no esta permitida por ahora.",
    };
  }

  return { success: true as const, data: results };
}

async function assertDraftBatch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  batchId: string,
) {
  if (!supabase) return { ok: false as const, message: "Supabase no esta configurado." };

  const { data, error } = await supabase
    .from("purchase_batches")
    .select("id, status")
    .eq("id", batchId)
    .single<{ id: string; status: string }>();

  if (error || !data) return { ok: false as const, message: "Borrador no encontrado." };
  if (data.status !== "borrador") {
    return { ok: false as const, message: "Solo se pueden editar compras multiples en borrador." };
  }

  return { ok: true as const };
}

async function getLineSnapshots(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string,
  supplierId: string,
) {
  if (!supabase) return { error: "Supabase no esta configurado." };

  const [productResult, supplierResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit_id, requires_classification, unit:units_of_measure(name, abbreviation)")
      .eq("id", productId)
      .eq("is_active", true)
      .single<{
        id: string;
        name: string;
        requires_classification?: boolean;
        unit: { name: string; abbreviation: string } | { name: string; abbreviation: string }[] | null;
      }>(),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("is_active", true)
      .single<{ id: string; name: string }>(),
  ]);

  if (productResult.error || !productResult.data) return { error: "Producto no encontrado o inactivo." };
  if (supplierResult.error || !supplierResult.data) return { error: "Proveedor no encontrado o inactivo." };

  const unit = Array.isArray(productResult.data.unit)
    ? productResult.data.unit[0] ?? null
    : productResult.data.unit;

  return {
    product: productResult.data,
    supplier: supplierResult.data,
    unit,
  };
}

export async function createPurchaseBatchAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = batchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el borrador." };
  }

  const { data, error } = await access.supabase
    .from("purchase_batches")
    .insert({
      batch_date: parsed.data.batch_date,
      notes: parsed.data.notes,
      created_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_purchase_batch",
    entityType: "purchase_batch",
    entityId: data.id,
  });

  revalidatePurchaseBatches();
  return { success: true, message: "Compra multiple creada como borrador." };
}

export async function updatePurchaseBatchAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const id = formData.get("id");
  const parsed = batchSchema.safeParse(Object.fromEntries(formData));

  if (typeof id !== "string" || !z.uuid().safeParse(id).success) {
    return { success: false, message: "Borrador invalido." };
  }

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el borrador." };
  }

  const draft = await assertDraftBatch(access.supabase, id);
  if (!draft.ok) return { success: false, message: draft.message };

  const { error } = await access.supabase
    .from("purchase_batches")
    .update({ batch_date: parsed.data.batch_date, notes: parsed.data.notes })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "update_purchase_batch",
    entityType: "purchase_batch",
    entityId: id,
  });

  revalidatePurchaseBatches();
  return { success: true, message: "Borrador actualizado." };
}

export async function addPurchaseBatchLineAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la linea." };
  }

  const draft = await assertDraftBatch(access.supabase, parsed.data.batch_id);
  if (!draft.ok) return { success: false, message: draft.message };

  const snapshots = await getLineSnapshots(access.supabase, parsed.data.product_id, parsed.data.supplier_id);
  if ("error" in snapshots) return { success: false, message: snapshots.error };

  const { count } = await access.supabase
    .from("purchase_batch_lines")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", parsed.data.batch_id);

  const { error } = await access.supabase.from("purchase_batch_lines").insert({
    batch_id: parsed.data.batch_id,
    product_id: parsed.data.product_id,
    supplier_id: parsed.data.supplier_id,
    quantity: parsed.data.quantity,
    unit_cost: parsed.data.unit_cost,
    payment_method: parsed.data.payment_method,
    notes: parsed.data.notes,
    sort_order: count ?? 0,
  });

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_purchase_batch_line",
    entityType: "purchase_batch",
    entityId: parsed.data.batch_id,
    metadata: {
      product_id: parsed.data.product_id,
      supplier_id: parsed.data.supplier_id,
      payment_method: parsed.data.payment_method,
      subtotal: parsed.data.quantity * parsed.data.unit_cost,
    },
  });

  revalidatePurchaseBatches();
  return { success: true, message: "Linea agregada al borrador." };
}

export async function updatePurchaseBatchLineAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = updateLineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la linea." };
  }

  const draft = await assertDraftBatch(access.supabase, parsed.data.batch_id);
  if (!draft.ok) return { success: false, message: draft.message };

  const snapshots = await getLineSnapshots(access.supabase, parsed.data.product_id, parsed.data.supplier_id);
  if ("error" in snapshots) return { success: false, message: snapshots.error };

  const { error } = await access.supabase
    .from("purchase_batch_lines")
    .update({
      product_id: parsed.data.product_id,
      supplier_id: parsed.data.supplier_id,
      quantity: parsed.data.quantity,
      unit_cost: parsed.data.unit_cost,
      payment_method: parsed.data.payment_method,
      notes: parsed.data.notes,
    })
    .eq("id", parsed.data.id)
    .eq("batch_id", parsed.data.batch_id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "update_purchase_batch_line",
    entityType: "purchase_batch",
    entityId: parsed.data.batch_id,
    metadata: {
      line_id: parsed.data.id,
      product_id: parsed.data.product_id,
      supplier_id: parsed.data.supplier_id,
      payment_method: parsed.data.payment_method,
      subtotal: parsed.data.quantity * parsed.data.unit_cost,
    },
  });

  revalidatePurchaseBatches();
  return { success: true, message: "Linea actualizada." };
}

export async function deletePurchaseBatchLineAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = deleteLineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Linea invalida." };
  }

  const { data: line, error: lineError } = await access.supabase
    .from("purchase_batch_lines")
    .select("id, batch_id")
    .eq("id", parsed.data.id)
    .single<{ id: string; batch_id: string }>();

  if (lineError || !line) return { success: false, message: "Linea no encontrada." };

  const draft = await assertDraftBatch(access.supabase, line.batch_id);
  if (!draft.ok) return { success: false, message: draft.message };

  const { error } = await access.supabase
    .from("purchase_batch_lines")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return { success: false, message: error.message };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "delete_purchase_batch_line",
    entityType: "purchase_batch",
    entityId: line.batch_id,
    metadata: { line_id: parsed.data.id },
  });

  revalidatePurchaseBatches();
  return { success: true, message: "Linea eliminada." };
}

export async function confirmPurchaseBatchAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = confirmBatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la confirmacion.",
    };
  }

  const { data, error } = await access.supabase.rpc("confirm_purchase_batch", {
    p_batch_id: parsed.data.id,
  });

  if (error) {
    return { success: false, message: purchaseBatchBusinessMessage(error.message) };
  }

  revalidatePurchaseBatches();
  return {
    success: true,
    message: `Compra multiple confirmada. Se crearon ${Array.isArray(data) ? data.length : 0} compras internas.`,
  };
}

export async function savePurchaseBatchLineClassificationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageBatches();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = classificationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la clasificacion.",
    };
  }

  const results = parseClassificationResults(formData);
  if (!results.success) return { success: false, message: results.message };

  const { error } = await access.supabase.rpc("save_purchase_batch_line_classification", {
    p_batch_line_id: parsed.data.line_id,
    p_waste_quantity: parsed.data.waste_quantity,
    p_results: results.data,
    p_notes: parsed.data.notes,
  });

  if (error) {
    return { success: false, message: classificationBusinessMessage(error.message) };
  }

  revalidatePurchaseBatches();
  return { success: true, message: "Clasificacion guardada correctamente." };
}
