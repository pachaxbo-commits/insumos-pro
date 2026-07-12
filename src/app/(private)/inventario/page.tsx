import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function InventarioPage() {
  await requireRoleAccess("/inventario");
  const transitionModule = getTransitionModuleByPath("/inventario");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
