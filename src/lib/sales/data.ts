import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type { Profile } from "@/types/auth";
import type { ProductCategory, ProductWithRelations, UnitOfMeasure } from "@/types/products";
import type {
  Customer,
  CustomerFilters,
  SaleFilters,
  SaleItemWithProduct,
  SalesSummary,
  SaleWithRelations,
  TopSoldProduct,
} from "@/types/sales";

type ProductQueryRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status" | "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type SaleItemQueryRow = Omit<SaleItemWithProduct, "product"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
};

type SaleQueryRow = Omit<SaleWithRelations, "customer" | "items" | "created_by_profile"> & {
  customer: Customer | Customer[] | null;
  items: SaleItemQueryRow[] | null;
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | Pick<Profile, "id" | "full_name" | "role">[] | null;
};

export type CustomersData = {
  customers: Customer[];
};

export type SalesData = {
  sales: SaleWithRelations[];
  customers: Customer[];
  products: ProductWithRelations[];
  summary: SalesSummary;
  topProducts: TopSoldProduct[];
};

const customerSelect =
  "id, name, business_name, nit, phone, email, address, customer_type, credit_limit, current_balance, is_active, created_at, updated_at";

const productSelect =
  "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function getDateRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    today: now.toISOString().slice(0, 10),
  };
}

function buildTopProducts(sales: SaleWithRelations[]): TopSoldProduct[] {
  const byProduct = new Map<string, TopSoldProduct>();

  for (const sale of sales) {
    if (sale.status !== "confirmada") continue;

    for (const item of sale.items) {
      const existing = byProduct.get(item.product_id);

      if (existing) {
        existing.quantity += Number(item.quantity);
        existing.revenue += Number(item.subtotal);
      } else {
        byProduct.set(item.product_id, {
          product_id: item.product_id,
          name: item.product?.name ?? "Producto no disponible",
          quantity: Number(item.quantity),
          revenue: Number(item.subtotal),
        });
      }
    }
  }

  return Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export async function getCustomersData(filters: CustomerFilters = {}): Promise<CustomersData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) return { customers: [] };

  let query = supabase.from("customers").select(customerSelect).order("name", { ascending: true });

  if (filters.q?.trim()) {
    const search = filters.q.trim().replaceAll("%", "");
    query = query.or(
      `name.ilike.%${search}%,business_name.ilike.%${search}%,nit.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "inactive") query = query.eq("is_active", false);
  if (filters.type && filters.type !== "all") query = query.eq("customer_type", filters.type);

  const { data, error } = await query;

  if (error) return { customers: [] };

  return { customers: (data ?? []) as Customer[] };
}

export async function getSalesData(filters: SaleFilters = {}): Promise<SalesData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const empty: SalesData = {
    sales: [],
    customers: [],
    products: [],
    topProducts: [],
    summary: {
      salesToday: 0,
      salesMonth: 0,
      activeCustomers: 0,
      pendingDebt: 0,
      draftSales: 0,
      confirmedSales: 0,
    },
  };

  if (!supabase) return empty;

  const [customersResult, productsResult] = await Promise.all([
    supabase.from("customers").select(customerSelect).order("name", { ascending: true }),
    supabase
      .from("products")
      .select(productSelect)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  let salesQuery = supabase
    .from("sales")
    .select(
      `id, customer_id, sale_date, subtotal, discount, total, payment_type, status, notes, created_by, created_at,
       customer:customers(${customerSelect}),
       items:sale_items(id, sale_id, product_id, quantity, unit_price, subtotal, product:products(${productSelect})),
       created_by_profile:profiles!sales_created_by_fkey(id, full_name, role)`,
    )
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);

  if (filters.customer && filters.customer !== "all") {
    salesQuery = salesQuery.eq("customer_id", filters.customer);
  }

  if (filters.status && filters.status !== "all") {
    salesQuery = salesQuery.eq("status", filters.status);
  }

  if (filters.date) {
    const range = getDateRange(filters.date);
    salesQuery = salesQuery.gte("sale_date", range.start).lt("sale_date", range.end);
  }

  const salesResult = await salesQuery;

  if (customersResult.error || productsResult.error || salesResult.error) return empty;

  const customers = (customersResult.data ?? []) as Customer[];
  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);
  const rows = (salesResult.data ?? []) as unknown as SaleQueryRow[];
  const sales = rows.map((sale) => {
    const customer = Array.isArray(sale.customer) ? sale.customer[0] ?? null : sale.customer;
    const createdByProfile = Array.isArray(sale.created_by_profile)
      ? sale.created_by_profile[0] ?? null
      : sale.created_by_profile;

    return {
      ...sale,
      customer,
      created_by_profile: createdByProfile,
      items: (sale.items ?? []).map((item) => {
        const product = Array.isArray(item.product) ? item.product[0] ?? null : item.product;

        return {
          ...item,
          product: product ? normalizeProduct(product) : null,
        };
      }),
    };
  });

  const month = getCurrentMonthRange();
  const confirmedSales = sales.filter((sale) => sale.status === "confirmada");

  return {
    customers,
    products,
    sales,
    topProducts: buildTopProducts(sales),
    summary: {
      salesToday: confirmedSales
        .filter((sale) => sale.sale_date === month.today)
        .reduce((sum, sale) => sum + Number(sale.total), 0),
      salesMonth: confirmedSales
        .filter((sale) => sale.sale_date >= month.start && sale.sale_date < month.end)
        .reduce((sum, sale) => sum + Number(sale.total), 0),
      activeCustomers: customers.filter((customer) => customer.is_active).length,
      pendingDebt: customers.reduce((sum, customer) => sum + Number(customer.current_balance), 0),
      draftSales: sales.filter((sale) => sale.status === "borrador").length,
      confirmedSales: confirmedSales.length,
    },
  };
}
