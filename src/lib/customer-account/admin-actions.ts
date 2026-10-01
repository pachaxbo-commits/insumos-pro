"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerAdminActionState = {
  success: boolean;
  message?: string;
};

const phone = z
  .string()
  .trim()
  .max(25, "El teléfono es demasiado largo.")
  .refine(
    (value) =>
      !value ||
      (/^\+?[0-9() -]+$/.test(value) &&
        value.replace(/\D/g, "").length >= 7 &&
        value.replace(/\D/g, "").length <= 15),
    "Ingresa un teléfono válido.",
  );

const customerFields = {
  business_name: z.string().trim().min(2).max(120),
  responsible_name: z.string().trim().min(2).max(120),
  phone,
  location_label: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(300),
  reference: z.string().trim().max(300),
};

const createSchema = z.object({
  ...customerFields,
  email: z.string().trim().toLowerCase().email().max(254),
});

const updateSchema = z.object({
  ...customerFields,
  id: z.string().uuid(),
  location_id: z.union([z.literal(""), z.string().uuid()]),
  is_active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

async function requireCustomerAdmin() {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") {
    throw new Error("Solo el administrador puede gestionar clientes.");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("Falta configurar el acceso privado de Supabase.");
  }
  return { actor: auth.user, admin };
}

async function requireCustomerAdminSession() {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") {
    throw new Error("Solo el administrador puede gestionar clientes.");
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Falta configurar la conexión de Supabase.");
  }
  return supabase;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export async function createCustomerAdminAction(
  _previous: CustomerAdminActionState,
  formData: FormData,
): Promise<CustomerAdminActionState> {
  let createdAuthId: string | null = null;
  try {
    const { actor, admin } = await requireCustomerAdmin();
    const parsed = createSchema.parse(Object.fromEntries(formData));
    const { data: existing } = await admin
      .from("customer_accounts")
      .select("id")
      .ilike("email", parsed.email)
      .maybeSingle();
    if (existing) throw new Error("Ya existe un cliente con ese correo.");

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: parsed.email,
        email_confirm: true,
        user_metadata: {
          full_name: parsed.responsible_name,
          account_type: "customer",
        },
      });
    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "No se pudo crear el cliente.");
    }
    createdAuthId = authData.user.id;

    const { error: accountError } = await admin
      .from("customer_accounts")
      .insert({
        id: createdAuthId,
        email: parsed.email,
        full_name: parsed.business_name,
        business_name: parsed.business_name,
        responsible_name: parsed.responsible_name,
        phone: parsed.phone || null,
        is_active: true,
      });
    if (accountError) throw new Error(accountError.message);

    const { error: locationError } = await admin
      .from("qb_customer_locations")
      .insert({
        customer_account_id: createdAuthId,
        label: parsed.location_label,
        address: parsed.address,
        reference: parsed.reference || null,
        phone: parsed.phone || null,
        is_primary: true,
        is_active: true,
      });
    if (locationError) throw new Error(locationError.message);

    await writeAuditLog({
      supabase: admin,
      userId: actor.id,
      action: "create_customer",
      entityType: "customer",
      entityId: createdAuthId,
      metadata: { email: parsed.email, source: "admin_directory" },
    });
    revalidatePath("/clientes");
    revalidatePath("/pedidos");
    return { success: true, message: "Cliente registrado." };
  } catch (error) {
    if (createdAuthId) {
      const admin = createSupabaseAdminClient();
      await admin?.auth.admin.deleteUser(createdAuthId);
    }
    return {
      success: false,
      message: actionError(error, "No se pudo registrar el cliente."),
    };
  }
}

export async function updateCustomerAdminAction(
  _previous: CustomerAdminActionState,
  formData: FormData,
): Promise<CustomerAdminActionState> {
  try {
    const supabase = await requireCustomerAdminSession();
    const parsed = updateSchema.parse(Object.fromEntries(formData));

    const { error } = await supabase.rpc("admin_update_qb_customer_directory", {
      p_customer_id: parsed.id,
      p_business_name: parsed.business_name,
      p_responsible_name: parsed.responsible_name,
      p_phone: parsed.phone || null,
      p_location_id: parsed.location_id || null,
      p_location_label: parsed.location_label,
      p_address: parsed.address,
      p_reference: parsed.reference || null,
      p_is_active: parsed.is_active,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/clientes");
    revalidatePath("/pedidos");
    return {
      success: true,
      message: parsed.is_active
        ? "Datos del cliente actualizados."
        : "Cliente marcado como inactivo.",
    };
  } catch (error) {
    return {
      success: false,
      message: actionError(error, "No se pudo actualizar el cliente."),
    };
  }
}

export async function deleteCustomerAdminAction(
  _previous: CustomerAdminActionState,
  formData: FormData,
): Promise<CustomerAdminActionState> {
  try {
    const supabase = await requireCustomerAdminSession();
    const parsed = deleteSchema.parse(Object.fromEntries(formData));
    const { data, error } = await supabase.rpc(
      "admin_force_delete_qb_customer",
      {
        p_customer_id: parsed.id,
      },
    );
    if (error) throw new Error(error.message);

    const deleted = data as {
      deleted_qb_orders?: unknown;
      deleted_legacy_orders?: unknown;
    } | null;
    const historyCount =
      Number(deleted?.deleted_qb_orders ?? 0) +
      Number(deleted?.deleted_legacy_orders ?? 0);

    revalidatePath("/clientes");
    revalidatePath("/pedidos");
    revalidatePath("/matriz-operativa");
    revalidatePath("/recibos");
    return {
      success: true,
      message:
        historyCount > 0
          ? `Cliente eliminado junto con ${historyCount} pedido${historyCount === 1 ? "" : "s"} asociado${historyCount === 1 ? "" : "s"}.`
          : "Cliente eliminado definitivamente.",
    };
  } catch (error) {
    return {
      success: false,
      message: actionError(error, "No se pudo eliminar el cliente."),
    };
  }
}

const resetPasswordSchema = z.object({
  id: z.string().uuid("ID de cliente inválido."),
  new_password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export async function resetCustomerPasswordAdminAction(
  _previous: CustomerAdminActionState,
  formData: FormData,
): Promise<CustomerAdminActionState> {
  try {
    const { actor, admin } = await requireCustomerAdmin();
    const customerId = formData.get("id");
    const newPassword = formData.get("new_password");

    const parsed = resetPasswordSchema.parse({
      id: customerId,
      new_password: newPassword,
    });

    const { data: customer, error: fetchError } = await admin
      .from("customer_accounts")
      .select("id, email, business_name")
      .eq("id", parsed.id)
      .maybeSingle();

    if (fetchError || !customer) {
      throw new Error("Cliente no encontrado.");
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      customer.id,
      { password: parsed.new_password },
    );

    if (authError) {
      throw new Error(authError.message || "No se pudo actualizar la contraseña.");
    }

    const auditClient = await createSupabaseServerClient();
    if (auditClient) {
      await writeAuditLog({
        supabase: auditClient,
        userId: actor.id,
        action: "reset_user_access",
        entityType: "customer",
        entityId: customer.id,
        metadata: {
          customer_email: customer.email,
          business_name: customer.business_name,
        },
      });
    }

    revalidatePath("/clientes");
    return {
      success: true,
      message: `Contraseña actualizada exitosamente para ${customer.business_name}.`,
    };
  } catch (error) {
    return {
      success: false,
      message: actionError(error, "No se pudo restablecer la contraseña."),
    };
  }
}
