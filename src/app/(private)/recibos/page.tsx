import { PageHeader } from "@/components/layout/page-header";
import { QbReceiptsManagement } from "@/components/qb-receipts/qb-receipts-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptsData } from "@/lib/qb-receipts/data";

export default async function RecibosPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const auth = await requireRoleAccess("/recibos");
  const { section } = await searchParams;
  const data = await getQbReceiptsData(auth.user.role!);
  const safeSection = auth.user.role === "supervisor" && section === "general" ? "emitidos" : section;
  const initialSection = ["pendientes", "borradores", "emitidos", "historial", "general"].includes(safeSection ?? "")
    ? (safeSection as "pendientes" | "borradores" | "emitidos" | "historial" | "general")
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={undefined}
        title="Recibos"
        description=""
      />
      <QbReceiptsManagement
        key={initialSection ?? "automatico"}
        {...data}
        userRole={auth.user.role!}
        initialSection={initialSection}
      />
    </div>
  );
}
