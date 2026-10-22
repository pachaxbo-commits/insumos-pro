export type ProductCorrectionKind = "solid" | "liquid" | "review";

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

export function classifyPhysicalProduct(categoryName: string | null | undefined, productName: string): ProductCorrectionKind {
  const category = normalized(categoryName);
  const name = normalized(productName);
  if (/(liquid|bebida|aceite|vinagre)/.test(category)) return "liquid";
  if (/\b(aceite|vinagre|leche|jugo|refresco|gaseosa|jarabe)\b/.test(name) || /^agua(?:\s|$)/.test(name)) return "liquid";
  if (/(verdur|frut[ao]s? fresc[ao]s?|hierb[ao]s? fresc[ao]s?|abarrot|grano|cereal|condimento|especia|fruto seco)/.test(category)) return "solid";
  if (/\b(papa|arveja|ajo|aji|cebolla|apio|acelga|zanahoria|tomate|haba|nabo|raban|remolacha|vainita|zucchini|pepino|perejil|cilantro|albahaca|menta|romero|tomillo|laurel|canela|clavo|anis|nuez moscada|ciruela|durazno|pera)\b/.test(name)) return "solid";
  return "review";
}
