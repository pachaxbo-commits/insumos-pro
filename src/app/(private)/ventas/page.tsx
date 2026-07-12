import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function VentasPage() {
  await requireRoleAccess("/ventas");
  const transitionModule = getTransitionModuleByPath("/ventas");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
