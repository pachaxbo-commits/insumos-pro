import type { Metadata } from "next";

import { CustomerAuth } from "@/components/customer-account/customer-auth";
import { CustomerPortal } from "@/components/customer-account/customer-portal";
import { getQbCatalogData, getQbCustomerPortalData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Mi cuenta | QB Insumos",
  description: "Consulta tus pedidos, ubicaciones y productos frecuentes.",
};

export default async function CustomerAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const [{ account, locations, orders, frequentProducts, error }, catalog] = await Promise.all([
    getQbCustomerPortalData(),
    getQbCatalogData(),
  ]);
  const params = await searchParams;

  if (!account) return <CustomerAuth authError={params?.error === "auth"} />;

  return (
    <CustomerPortal
      account={account}
      locations={locations}
      orders={orders}
      frequentProducts={frequentProducts}
      catalogProducts={catalog.products}
      error={error ?? catalog.error}
    />
  );
}
