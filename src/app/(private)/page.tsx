import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function DashboardPage() {
  await requireRoleAccess("/");
  return <DashboardOverview />;
}
