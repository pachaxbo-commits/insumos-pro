import Link from "next/link";
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
  if (auth.user.role === "supervisor") {
    return (
      <section className="space-y-4">
        <PageHeader title="Recibos emitidos" description="Documentos de las sedes autorizadas." />
        {data.error ? <p role="alert">{data.error}</p> : data.receipts.length ? (
          <ul className="space-y-2">
            {data.receipts.map((receipt) => (
              <li key={receipt.id} className="rounded border bg-background p-3">
                <Link className="underline" href={`/recibos/${receipt.id}`}>
                  {receipt.number} · {receipt.customerName}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p>No hay recibos emitidos disponibles para esta cuenta.</p>}
      </section>
    );
  }
  const safeSection = section;
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
