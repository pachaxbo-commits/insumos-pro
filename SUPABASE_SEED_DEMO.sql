-- SEED DEMO / STAGING - NO USAR EN PRODUCCION REAL
-- Ejecutar solo despues de SUPABASE_SCHEMA.sql y solo en entornos demo o staging.
-- No crea usuarios Auth ni perfiles reales.

insert into public.product_categories (name, description, is_active)
values
  ('Verduras', 'Productos frescos por peso o unidad.', true),
  ('Abarrotes', 'Insumos secos de alta rotacion.', true),
  ('Condimentos', 'Especias, sazonadores y mezclas.', true),
  ('Aceites', 'Aceites y grasas para cocina.', true)
on conflict (name) do update
set
  description = excluded.description,
  is_active = excluded.is_active;

insert into public.units_of_measure (name, abbreviation, is_active)
values
  ('Kilogramo', 'kg', true),
  ('Unidad', 'unidad', true),
  ('Caja', 'caja', true),
  ('Bolsa', 'bolsa', true),
  ('Paquete', 'paquete', true),
  ('Litro', 'litro', true)
on conflict (name) do update
set
  abbreviation = excluded.abbreviation,
  is_active = excluded.is_active;

insert into public.products (
  name,
  sku,
  category_id,
  unit_id,
  stock_current,
  stock_min,
  purchase_price,
  sale_price,
  supplier_name,
  is_active
)
values
  (
    'Tomate perita',
    'VER-TOM-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    120,
    40,
    4.50,
    6.50,
    'Proveedor demo verduras',
    true
  ),
  (
    'Papa holandesa',
    'VER-PAP-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    85,
    60,
    3.20,
    4.80,
    'Proveedor demo verduras',
    true
  ),
  (
    'Cebolla roja',
    'VER-CEB-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    38,
    60,
    2.90,
    4.20,
    'Proveedor demo verduras',
    true
  ),
  (
    'Locoto fresco',
    'VER-LOC-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    0,
    25,
    8.00,
    12.00,
    'Proveedor demo verduras',
    true
  ),
  (
    'Arroz premium 50 kg',
    'ABA-ARR-050',
    (select id from public.product_categories where name = 'Abarrotes'),
    (select id from public.units_of_measure where abbreviation = 'bolsa'),
    42,
    15,
    320.00,
    390.00,
    'Proveedor demo abarrotes',
    true
  ),
  (
    'Aceite vegetal 5 L',
    'ACE-VEG-005',
    (select id from public.product_categories where name = 'Aceites'),
    (select id from public.units_of_measure where abbreviation = 'litro'),
    18,
    20,
    42.00,
    58.00,
    'Proveedor demo aceites',
    true
  ),
  (
    'Condimento mixto',
    'CON-MIX-001',
    (select id from public.product_categories where name = 'Condimentos'),
    (select id from public.units_of_measure where abbreviation = 'paquete'),
    64,
    18,
    9.50,
    14.00,
    'Proveedor demo condimentos',
    true
  )
on conflict (sku) do update
set
  name = excluded.name,
  category_id = excluded.category_id,
  unit_id = excluded.unit_id,
  stock_current = excluded.stock_current,
  stock_min = excluded.stock_min,
  purchase_price = excluded.purchase_price,
  sale_price = excluded.sale_price,
  supplier_name = excluded.supplier_name,
  is_active = excluded.is_active;

insert into public.suppliers (name, contact_name, phone, address, notes, is_active)
values
  ('Agricola Don Pepe', 'Jose Perez', '700-10001', 'Mercado mayorista demo', 'Proveedor demo de verduras.', true),
  ('Distribuidora El Sol', 'Carla Rojas', '700-10002', 'Zona industrial demo', 'Proveedor demo de aceites y abarrotes.', true),
  ('Sabores del Valle', 'Mario Vargas', '700-10003', 'Av. Comercial demo', 'Proveedor demo de condimentos.', true)
on conflict (name) do update
set
  contact_name = excluded.contact_name,
  phone = excluded.phone,
  address = excluded.address,
  notes = excluded.notes,
  is_active = excluded.is_active;

insert into public.customers (
  name,
  business_name,
  nit,
  phone,
  email,
  address,
  customer_type,
  credit_limit,
  current_balance,
  is_active
)
values
  ('Restaurante El Buen Sabor', 'El Buen Sabor SRL', '10203040', '700-20001', 'compras@buensabor.demo', 'Zona central demo', 'credito', 12000, 0, true),
  ('Pollos Don Raul', 'Don Raul Gastronomia', '20406080', '700-20002', 'pedidos@donraul.demo', 'Av. Comercial demo', 'contado', 0, 0, true),
  ('Hotel Valle Verde', 'Valle Verde Hoteles', '30102030', '700-20003', 'abastecimiento@valleverde.demo', 'Zona hotelera demo', 'credito', 25000, 0, true),
  ('Mercado Express Norte', 'Mercado Express Norte', '40908070', '700-20004', null, 'Sucursal norte demo', 'contado', 0, 0, true)
on conflict (name) do update
set
  business_name = excluded.business_name,
  nit = excluded.nit,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  customer_type = excluded.customer_type,
  credit_limit = excluded.credit_limit,
  is_active = excluded.is_active;

