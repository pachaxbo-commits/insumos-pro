import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function ComprasPage() {
  await requireRoleAccess("/compras");
  const transitionModule = getTransitionModuleByPath("/compras");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
