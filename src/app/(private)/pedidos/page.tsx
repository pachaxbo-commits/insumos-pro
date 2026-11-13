import { PageHeader } from "@/components/layout/page-header";
import { OrderCreationWorkspace } from "@/components/qb-orders/order-creation-workspace";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbInternalOrdersData } from "@/lib/qb-orders/data";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const auth = await requireRoleAccess("/pedidos");
  const data = await getQbInternalOrdersData(false, auth.user.role!);
  const params = await searchParams;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={undefined}
        title="Crear pedidos"
        description=""
      />
      <OrderCreationWorkspace
        {...data}
        canEdit={auth.user.role === "administrador"}
        initialEditingOrderId={auth.user.role === "administrador" ? params.edit : undefined}
      />
    </div>
  );
}
