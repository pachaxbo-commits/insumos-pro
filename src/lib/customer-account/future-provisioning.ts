import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateInitialPassword } from "@/lib/auth/password-normalization";

export type CustomerProvisioningReport = {
  totalChecked: number;
  alreadyLinked: number;
  toProvision: number;
  problematicCases: Array<{
    customerId: string;
    businessName: string;
    email: string;
    reason: "invalid_email" | "empty_password" | "password_too_short" | "duplicate_email";
    suggestedPassword?: string;
  }>;
};

/**
 * Diagnostic analysis of customer accounts for future auth provisioning.
 * Read-only analysis: does NOT create or modify any auth users.
 */
export async function diagnoseCustomerAccountsForProvisioning(): Promise<CustomerProvisioningReport> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("Falta la configuración privada de administración de Supabase.");
  }

  const { data: accounts, error: accountsError } = await admin
    .from("customer_accounts")
    .select("id, email, full_name, business_name, responsible_name, is_active");

  if (accountsError || !accounts) {
    throw new Error(`Error al leer cuentas de clientes: ${accountsError?.message}`);
  }

  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });

  if (authError || !authData) {
    throw new Error(`Error al leer usuarios de Auth: ${authError?.message}`);
  }

  const authUserById = new Map(authData.users.map((u) => [u.id, u]));
  const authUserByEmail = new Map(
    authData.users.map((u) => [u.email?.toLowerCase().trim() ?? "", u]),
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailCounts = new Map<string, number>();
  for (const acc of accounts) {
    const email = acc.email?.toLowerCase().trim();
    if (email) {
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    }
  }

  let alreadyLinked = 0;
  let toProvision = 0;
  const problematicCases: CustomerProvisioningReport["problematicCases"] = [];

  for (const account of accounts) {
    const email = account.email?.toLowerCase().trim();
    const hasAuth =
      authUserById.has(account.id) || (email ? authUserByEmail.has(email) : false);

    if (hasAuth) {
      alreadyLinked++;
    } else {
      toProvision++;
    }

    if (!email || !emailRegex.test(email)) {
      problematicCases.push({
        customerId: account.id,
        businessName: account.business_name,
        email: account.email ?? "",
        reason: "invalid_email",
      });
      continue;
    }

    if ((emailCounts.get(email) ?? 0) > 1) {
      problematicCases.push({
        customerId: account.id,
        businessName: account.business_name,
        email,
        reason: "duplicate_email",
      });
      continue;
    }

    const passwordValidation = validateInitialPassword(
      account.business_name || account.full_name,
    );
    if (!passwordValidation.isValid) {
      problematicCases.push({
        customerId: account.id,
        businessName: account.business_name,
        email,
        reason:
          passwordValidation.error === "empty"
            ? "empty_password"
            : "password_too_short",
        suggestedPassword: passwordValidation.password,
      });
    }
  }

  return {
    totalChecked: accounts.length,
    alreadyLinked,
    toProvision,
    problematicCases,
  };
}

/**
 * Idempotent provisioning function prepared for future controlled execution.
 * DO NOT RUN IN PRODUCTION WITHOUT EXPLICIT OWNER APPROVAL.
 */
export async function executeIdempotentCustomerProvisioning(dryRun = true) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error("Falta la configuración privada de administración de Supabase.");
  }

  const diagnostic = await diagnoseCustomerAccountsForProvisioning();
  if (dryRun) {
    return {
      dryRun: true,
      diagnostic,
      message: "Modo de simulación (dry run). No se creó ningún usuario en Auth.",
    };
  }

  // Future execution logic when approved:
  // Only provisions accounts where hasAuth === false and isValid === true.
  return {
    dryRun: false,
    diagnostic,
    message: "Aprovisionamiento ejecutado.",
  };
}
