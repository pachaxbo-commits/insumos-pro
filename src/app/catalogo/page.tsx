import type { Metadata } from "next";

import { PublicCatalog } from "@/components/catalog/public-catalog";
import { getQbCatalogData } from "@/lib/qb-catalog/data";

export const metadata: Metadata = {
  title: "Catalogo | QB Insumos",
  description: "Catalogo QB de productos disponibles para pedido.",
};

export default async function CatalogPage() {
  const data = await getQbCatalogData();

  return <PublicCatalog {...data} />;
}
