import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function FinanzasPage() {
  await requireRoleAccess("/finanzas");
  const transitionModule = getTransitionModuleByPath("/finanzas");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
