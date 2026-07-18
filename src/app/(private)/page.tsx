import { QbTransitionHome } from "@/components/qb-insumos/qb-transition-home";
import { requireRoleAccess } from "@/lib/auth/session";
import { canAccessPath } from "@/lib/auth/roles";
import { getActiveTransitionalModules } from "@/lib/qb-insumos/transition-policy";
import { getQbReportsData } from "@/lib/reports/data";
import { getQbOperationalSettingsData } from "@/lib/operational-settings/data";

export default async function DashboardPage() {
  const auth = await requireRoleAccess("/");
  const activeModules = getActiveTransitionalModules().filter((module) =>
    module.href ? canAccessPath(auth.user.role, module.href) : false,
  );
  const [reportsData, operationalSettings] = await Promise.all([
    getQbReportsData(auth.user.role!, {}),
    getQbOperationalSettingsData(),
  ]);

  return (
    <QbTransitionHome
      activeModules={activeModules}
      reportsData={reportsData}
      operationalSettings={operationalSettings}
    />
  );
}
