import type { Metadata } from "next";

import { PublicCatalog } from "@/components/catalog/public-catalog";
import { getQbCatalogData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Catálogo | QB Insumos",
  description: "Catálogo de productos disponibles para pedido.",
};

export default async function CatalogPage() {
  const data = await getQbCatalogData();

  return <PublicCatalog {...data} />;
}
