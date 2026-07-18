import { ModuleTransitionScreen } from "@/components/qb-insumos/module-transition-screen";
import { StockControlBanner } from "@/components/inventory/stock-control-banner";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbOperationalSettingsData } from "@/lib/operational-settings/data";
import { getTransitionModuleByPath } from "@/lib/qb-insumos/transition-policy";

export default async function InventarioPage() {
  await requireRoleAccess("/inventario");
  const transitionModule = getTransitionModuleByPath("/inventario");
  const settings = await getQbOperationalSettingsData();

  return (
    <div className="space-y-4">
      <StockControlBanner settings={settings} />
      <ModuleTransitionScreen module={transitionModule!} />
    </div>
  );
}
