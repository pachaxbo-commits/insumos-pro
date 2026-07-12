import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function CompraMultiplePage() {
  await requireRoleAccess("/compras/multiple");
  const transitionModule = getTransitionModuleByPath("/compras/multiple");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
