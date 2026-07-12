import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { requireRoleAccess } from "@/lib/auth/session";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function ProveedoresPage() {
  await requireRoleAccess("/proveedores");
  const transitionModule = getTransitionModuleByPath("/proveedores");

  return <ModuleTransitionScreen module={transitionModule!} />;
}
