import { PageHeader } from "@/components/layout/page-header";
import { QbReceiptsManagement } from "@/components/qb-receipts/qb-receipts-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptsData } from "@/lib/qb-receipts/data";

export default async function RecibosPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  await requireRoleAccess("/recibos");
  const { section } = await searchParams;
  const data = await getQbReceiptsData();
  const initialSection = ["pendientes", "borradores", "emitidos", "historial", "general"].includes(section ?? "")
    ? (section as "pendientes" | "borradores" | "emitidos" | "historial" | "general")
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
        initialSection={initialSection}
      />
    </div>
  );
}
