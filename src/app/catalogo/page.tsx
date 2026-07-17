import type { Metadata } from "next";

import { PublicCatalog } from "@/components/catalog/public-catalog";
import { CustomerConfirmationStatus } from "@/components/customer-account/confirmation-status";
import { getQbCatalogData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Catálogo | QB Insumos",
  description: "Catálogo de productos disponibles para pedido.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const params = await searchParams;
  const data = await getQbCatalogData();

  return (
    <>
      <CustomerConfirmationStatus state={params.confirmation} />
      <PublicCatalog {...data} />
    </>
  );
}
