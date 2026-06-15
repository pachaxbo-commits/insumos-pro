import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireRoleAccess } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/data";

export default async function DashboardPage() {
  await requireRoleAccess("/");
  const data = await getDashboardData();

  return <DashboardOverview data={data} />;
}
