-- Catálogo operativo importado desde "QB Insumos - Órdenes.xlsx".
-- Fuente: siete hojas del 11/07/2026 al 22/07/2026.
-- Alcance: 159 productos únicos, sus colores exactos y unidades seguras de pedido.

begin;

alter table public.products
  add column if not exists matrix_color text not null default '#FFFFFF';

alter table public.products
  drop constraint if exists products_matrix_color_check;
alter table public.products
  add constraint products_matrix_color_check
  check (matrix_color ~ '^#[0-9A-F]{6}$');

comment on column public.products.matrix_color is
  'Color hexadecimal de la fila del producto en la matriz operativa.';

create or replace function pg_temp.qb_excel_name_key(value text)
returns text
language sql
immutable
strict
as $$
  select trim(
    regexp_replace(
      translate(upper(value), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create temporary table qb_excel_catalog_import (
  name_key text primary key,
  product_name text not null,
  category_name text not null,
  matrix_color text not null,
  base_unit_code text not null,
  source_unit_codes text[] not null
) on commit drop;

insert into qb_excel_catalog_import (
  name_key,
  product_name,
  category_name,
  matrix_color,
  base_unit_code,
  source_unit_codes
) values
  ('ACEITE', 'ACEITE', 'CONSERVAS, SALSAS Y ACEITES', '#FEF2C8', 'litro', array['litro']::text[]),
  ('ACEITUNA VERDE', 'ACEITUNA VERDE', 'CONSERVAS, SALSAS Y ACEITES', '#E0F9D7', 'unidad', array['frasco']::text[]),
  ('ACHOJCHA', 'ACHOJCHA', 'VERDURAS', '#CEFDD0', 'cuartilla', array['cuartilla']::text[]),
  ('AGUA CON GAS', 'AGUA CON GAS', 'CONSERVAS, SALSAS Y ACEITES', '#E7E9E7', 'unidad', array['botella']::text[]),
  ('AJI UCHU', 'AJI UCHU', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F9CA48', 'kg', array['kg']::text[]),
  ('AJI UCHU ROJO', 'AJI UCHU ROJO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F7C0C0', 'cuartilla', array['cuartilla']::text[]),
  ('AJINOMOTO', 'AJINOMOTO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F5F5F5', 'kg', array['kg', 'libra']::text[]),
  ('AJO EN DIENTE', 'AJO EN DIENTE', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F4F3EC', 'libra', array['cabeza', 'cuartilla', 'libra']::text[]),
  ('AJO EN POLVO', 'AJO EN POLVO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FFFFEB', 'kg', array['kg', 'libra']::text[]),
  ('AJO PELADO', 'AJO PELADO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FFFBCC', 'kg', array['kg', 'libra']::text[]),
  ('ALBAHACA', 'ALBAHACA', 'HIERBAS FRESCAS', '#A8F0AB', 'unidad', array['amarro']::text[]),
  ('ALCOHOL 5LITROS', 'ALCOHOL 5LITROS', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#C4C4C4', 'unidad', array['unidad']::text[]),
  ('ALITA POLLO', 'ALITA (POLLO)', 'CARNES Y AVES', '#F9FCD4', 'kg', array['kg']::text[]),
  ('APIO', 'APIO', 'HIERBAS FRESCAS', '#A2E6A5', 'unidad', array['amarro', 'bolsa']::text[]),
  ('ARROZ 1RA GRANO ORO', 'ARROZ 1RA GRANO ORO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#FFFFFF', 'arroba', array['arroba', 'cuartilla', 'quintal']::text[]),
  ('ARROZ PARTIDO', 'ARROZ PARTIDO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#FDFCFC', 'arroba', array['arroba']::text[]),
  ('ARVEJA', 'ARVEJA', 'VERDURAS', '#B2EA99', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('AZUCAR BLANCA', 'AZÚCAR BLANCA', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#FFFFFF', 'arroba', array['arroba', 'quintal']::text[]),
  ('BERENJENA', 'BERENJENA', 'VERDURAS', '#DFB1EC', 'unidad', array['unidad']::text[]),
  ('BOLSA BLANCA 27X48', 'BOLSA BLANCA 27X48', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#FFFFFF', 'unidad', array['jaba']::text[]),
  ('BOLSA BLANCA 35X65', 'BOLSA BLANCA 35X65', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#FFFFFF', 'unidad', array['jaba']::text[]),
  ('BOMBRIL DURO GRUESO', 'BOMBRIL DURO GRUESO', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#BFBFBF', 'unidad', array['unidad']::text[]),
  ('BROCOLI', 'BROCOLI', 'VERDURAS', '#7CE175', 'unidad', array['unidad']::text[]),
  ('BRUSELAS', 'BRUSELAS', 'VERDURAS', '#E1F9E1', 'kg', array['kg']::text[]),
  ('CAFE INSTANTANEO', 'CAFE INSTANTANEO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#FFD4B3', 'unidad', array['frasco']::text[]),
  ('CAMOTE', 'CAMOTE', 'VERDURAS', '#F9D3B3', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('CAMOTE GRANDE', 'CAMOTE GRANDE', 'VERDURAS', '#FBD8BC', 'arroba', array['arroba']::text[]),
  ('CAMOTE MEDIANO', 'CAMOTE MEDIANO', 'VERDURAS', '#FFEBFE', 'cuartilla', array['cuartilla']::text[]),
  ('CEBOLLA BLANCA', 'CEBOLLA BLANCA', 'VERDURAS', '#F3F4F0', 'kg', array['arroba', 'cuartilla', 'kg', 'unidad']::text[]),
  ('CEBOLLA CEVICHE', 'CEBOLLA CEVICHE', 'VERDURAS', '#C9BDFF', 'arroba', array['arroba']::text[]),
  ('CEBOLLA EN POLVO', 'CEBOLLA EN POLVO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FFF4CF', 'gr', array['gr']::text[]),
  ('CEBOLLA ESCABECHE', 'CEBOLLA ESCABECHE', 'VERDURAS', '#F7D4F4', 'cuartilla', array['cuartilla']::text[]),
  ('CEBOLLA MORADA', 'CEBOLLA MORADA', 'VERDURAS', '#D6C2FF', 'kg', array['arroba', 'cuartilla', 'kg', 'unidad']::text[]),
  ('CEBOLLA MORADA MEDIANA', 'CEBOLLA MORADA MEDIANA', 'VERDURAS', '#F6D9F7', 'arroba', array['arroba']::text[]),
  ('CEBOLLA VERDE', 'CEBOLLA VERDE', 'VERDURAS', '#83C79B', 'unidad', array[]::text[]),
  ('CEBOLLIN GRUESO', 'CEBOLLIN GRUESO', 'HIERBAS FRESCAS', '#D6F5D7', 'unidad', array['amarro']::text[]),
  ('CHAMPINON PORTO BELLO', 'CHAMPIÑON PORTO BELLO', 'VERDURAS', '#F9F4EC', 'unidad', array['bandeja']::text[]),
  ('CHERRY TOMATE', 'CHERRY TOMATE', 'VERDURAS', '#F4A58B', 'kg', array['bandeja', 'kg']::text[]),
  ('CHOCLO 1RA TIERNO', 'CHOCLO 1RA TIERNO', 'VERDURAS', '#FFFDCF', 'unidad', array['unidad']::text[]),
  ('CHOCLO LATA GRANDE', 'CHOCLO LATA GRANDE', 'CONSERVAS, SALSAS Y ACEITES', '#F5F7DF', 'unidad', array['unidad']::text[]),
  ('CHORIZO SAN JORGE', 'CHORIZO SAN JORGE', 'CARNES Y AVES', '#FBE6D5', 'kg', array['kg']::text[]),
  ('CHORIZO TRICARNE', 'CHORIZO TRICARNE', 'CARNES Y AVES', '#F5EAE0', 'kg', array['kg']::text[]),
  ('CIBULET', 'CIBULET', 'HIERBAS FRESCAS', '#A7E6AA', 'unidad', array['amarro']::text[]),
  ('CILANTRO', 'CILANTRO', 'HIERBAS FRESCAS', '#A2CF99', 'unidad', array['amarro']::text[]),
  ('COLIFLOR', 'COLIFLOR', 'VERDURAS', '#F4F9B4', 'unidad', array['unidad']::text[]),
  ('COMINO MOLIDO', 'COMINO MOLIDO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FFFFFF', 'libra', array['libra']::text[]),
  ('CREMA DE LECHE AMARILLA', 'CREMA DE LECHE AMARILLA', 'LÁCTEOS Y HUEVOS', '#F7F9DC', 'unidad', array['bolsa']::text[]),
  ('CREMA LECHE AZUL 1 L', 'CREMA LECHE AZUL 1 L', 'LÁCTEOS Y HUEVOS', '#B3CBFF', 'unidad', array['bolsa']::text[]),
  ('CURRY', 'CURRY', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FFFFFF', 'gr', array['gr']::text[]),
  ('DESECHABLES 500 ML SOPA', 'DESECHABLES 500 ML SOPA', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#F2F7F3', 'unidad', array['paquete']::text[]),
  ('DNA GUSTA PESCADO', 'DÑA GUSTA PESCADO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#BDFFF6', 'unidad', array['paquete']::text[]),
  ('DURAZNO EN LATA', 'DURAZNO EN LATA', 'CONSERVAS, SALSAS Y ACEITES', '#F3E4C4', 'unidad', array['unidad']::text[]),
  ('ESPINACA', 'ESPINACA', 'HIERBAS FRESCAS', '#CFF7D0', 'cuartilla', array['cuartilla']::text[]),
  ('ESPONJA', 'ESPONJA', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#FFFFFF', 'unidad', array['paquete']::text[]),
  ('FIDEO CABELLO ANGEL', 'FIDEO CABELLO ANGEL', 'PASTAS Y CEREALES SECOS', '#F1F5BC', 'cuartilla', array['cuartilla']::text[]),
  ('FIDEO MACARON PEQUENO', 'FIDEO MACARON PEQUEÑO', 'PASTAS Y CEREALES SECOS', '#FFFFFF', 'cuartilla', array['cuartilla']::text[]),
  ('FILETE SIN HUESO POLLO', 'FILETE SIN HUESO (POLLO)', 'CARNES Y AVES', '#FFEDED', 'kg', array['kg']::text[]),
  ('FOSFORO', 'FÓSFORO', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#FFFFFF', 'unidad', array['paquete']::text[]),
  ('FRUTILLA', 'FRUTILLA', 'FRUTAS FRESCAS', '#F7CDBB', 'unidad', array['caja']::text[]),
  ('HABA', 'HABA', 'VERDURAS', '#E9F2E9', 'arroba', array['arroba', 'cuartilla']::text[]),
  ('HARINA COMUN', 'HARINA (COMÚN)', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#FFFFFF', 'arroba', array['arroba']::text[]),
  ('HARINA VICTORIA', 'HARINA VICTORIA', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F2F2F2', 'quintal', array['quintal']::text[]),
  ('HARRY LIMONERO', 'HARRY LIMONERO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F4FFC2', 'unidad', array['paquete', 'unidad']::text[]),
  ('HIERBA BUENA', 'HIERBA BUENA', 'HIERBAS FRESCAS', '#B9EFBB', 'unidad', array['amarro']::text[]),
  ('HUEVO', 'HUEVO', 'LÁCTEOS Y HUEVOS', '#F4F5D1', 'unidad', array['maple']::text[]),
  ('JENGIBRE FRESCO', 'JENGIBRE FRESCO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F0F9F1', 'libra', array['libra']::text[]),
  ('KETCHUP BOTE', 'KETCHUP BOTE', 'CONSERVAS, SALSAS Y ACEITES', '#FFDEDE', 'unidad', array['unidad']::text[]),
  ('KETCHUP SACHET', 'KETCHUP SACHET', 'CONSERVAS, SALSAS Y ACEITES', '#FFDEDE', 'unidad', array['caja']::text[]),
  ('LAUREL', 'LAUREL', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#BEEBBF', 'unidad', array[]::text[]),
  ('LECHE ENTERA PIL', 'LECHE ENTERA PIL', 'LÁCTEOS Y HUEVOS', '#D7EBF4', 'unidad', array['bolsa']::text[]),
  ('LECHUGA CRESPA', 'LECHUGA CRESPA', 'VERDURAS', '#C7F5C6', 'unidad', array['bolsa']::text[]),
  ('LECHUGA ESCAROLA', 'LECHUGA ESCAROLA', 'VERDURAS', '#B9EEEF', 'unidad', array['unidad']::text[]),
  ('LENTEJA', 'LENTEJA', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F2E5B1', 'libra', array['libra']::text[]),
  ('LIMON PARRILLERO', 'LIMON PARRILLERO', 'FRUTAS FRESCAS', '#DFEEAA', 'unidad', array['unidad']::text[]),
  ('LIMON SUTIL', 'LIMON SUTIL', 'FRUTAS FRESCAS', '#FEFFAD', 'unidad', array['unidad']::text[]),
  ('LIMON SUTIL VERDE', 'LIMON SUTIL VERDE', 'FRUTAS FRESCAS', '#E7FDE8', 'unidad', array['unidad']::text[]),
  ('LIMON VERDE SIN PEPA', 'LIMON VERDE SIN PEPA', 'FRUTAS FRESCAS', '#ABF2AE', 'unidad', array['unidad']::text[]),
  ('LOCOTO', 'LOCOTO', 'VERDURAS', '#D7F9DE', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('LOCOTO GRANDE', 'LOCOTO GRANDE', 'VERDURAS', '#D9F5D6', 'cuartilla', array['cuartilla']::text[]),
  ('LOCOTO VERDE', 'LOCOTO VERDE', 'VERDURAS', '#D9F5D6', 'arroba', array['arroba']::text[]),
  ('MAICENA', 'MAICENA', 'PASTAS Y CEREALES SECOS', '#FFFFFF', 'arroba', array['arroba']::text[]),
  ('MANDARINA CRIOLLA', 'MANDARINA CRIOLLA', 'FRUTAS FRESCAS', '#FFE6C7', 'unidad', array['unidad']::text[]),
  ('MANI', 'MANÍ', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F6F7DF', 'kg', array['arroba', 'kg', 'libra']::text[]),
  ('MANI PARTIDO', 'MANÍ PARTIDO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#E7EECE', 'kg', array['kg', 'quintal']::text[]),
  ('MANTEQUILLA A GRANEL SIN SAL', 'MANTEQUILLA A GRANEL SIN SAL', 'LÁCTEOS Y HUEVOS', '#FFE9BA', 'kg', array['kg']::text[]),
  ('MANTEQUILLA CON SAL PIL', 'MANTEQUILLA CON SAL PIL', 'LÁCTEOS Y HUEVOS', '#FEF4C3', 'unidad', array['paquete']::text[]),
  ('MANTEQUILLA SIN SAL', 'MANTEQUILLA SIN SAL', 'LÁCTEOS Y HUEVOS', '#F7F7CA', 'unidad', array['unidad']::text[]),
  ('MANZANA ROJA', 'MANZANA ROJA', 'FRUTAS FRESCAS', '#FBC1A2', 'unidad', array['unidad']::text[]),
  ('MANZANA VERDE', 'MANZANA VERDE', 'FRUTAS FRESCAS', '#CDF4CE', 'unidad', array['caja', 'unidad']::text[]),
  ('MARACUYA', 'MARACUYÁ', 'FRUTAS FRESCAS', '#FFFFFF', 'arroba', array['arroba', 'cuartilla', 'unidad']::text[]),
  ('MAYONESA BOTE', 'MAYONESA BOTE', 'CONSERVAS, SALSAS Y ACEITES', '#FFFFFF', 'unidad', array['unidad']::text[]),
  ('MAYONESA SACHET', 'MAYONESA SACHET', 'CONSERVAS, SALSAS Y ACEITES', '#FFFBDE', 'unidad', array['caja']::text[]),
  ('MORA', 'MORA', 'FRUTAS FRESCAS', '#ECD9FF', 'unidad', array['caja']::text[]),
  ('MOSTAZA GRANDE BOTE', 'MOSTAZA GRANDE BOTE', 'CONSERVAS, SALSAS Y ACEITES', '#FFE89E', 'unidad', array['unidad']::text[]),
  ('MOTE BLANCO', 'MOTE BLANCO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F9FBF9', 'cuartilla', array['cuartilla']::text[]),
  ('MOTE CHOCLO', 'MOTE CHOCLO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F5FFD1', 'arroba', array['arroba', 'cuartilla']::text[]),
  ('NABO', 'NABO', 'VERDURAS', '#F7D9F3', 'cuartilla', array['cuartilla']::text[]),
  ('NARANJA', 'NARANJA', 'FRUTAS FRESCAS', '#FBC983', 'unidad', array['unidad']::text[]),
  ('OREGANO', 'ORÉGANO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#A4DBA6', 'libra', array['libra']::text[]),
  ('OREGANO POLVO', 'ORÉGANO POLVO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#C4EEC5', 'libra', array['gr', 'libra']::text[]),
  ('PALTA MADURA', 'PALTA MADURA', 'FRUTAS FRESCAS', '#EEB4EC', 'unidad', array['unidad']::text[]),
  ('PALTA SEMI MADURA', 'PALTA SEMI MADURA', 'FRUTAS FRESCAS', '#F4D2F3', 'unidad', array['unidad']::text[]),
  ('PAPA HOLANDESA GRANDE', 'PAPA HOLANDESA GRANDE', 'VERDURAS', '#FBF4D0', 'arroba', array['arroba']::text[]),
  ('PAPA HOLANDESA MEDIANA', 'PAPA HOLANDESA MEDIANA', 'VERDURAS', '#F9F9C8', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('PAPA IMILLA', 'PAPA IMILLA', 'VERDURAS', '#F7EBCA', 'arroba', array['arroba']::text[]),
  ('PAPAYA', 'PAPAYA', 'FRUTAS FRESCAS', '#F9E49A', 'unidad', array['unidad']::text[]),
  ('PAPIN', 'PAPIN', 'VERDURAS', '#F2F1E3', 'arroba', array['arroba', 'cuartilla']::text[]),
  ('PAPRIKA', 'PAPRIKA', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#F5C7B7', 'kg', array['kg', 'libra']::text[]),
  ('PECHUGA CON HUESO POLLO', 'PECHUGA CON HUESO (POLLO)', 'CARNES Y AVES', '#FFEBEB', 'kg', array['kg', 'unidad']::text[]),
  ('PEPINO', 'PEPINO', 'VERDURAS', '#E3F7DF', 'arroba', array['arroba', 'cuartilla', 'unidad']::text[]),
  ('PEREJIL', 'PEREJIL', 'HIERBAS FRESCAS', '#ADF5B0', 'unidad', array['amarro']::text[]),
  ('PIERNA MUSLO POLLO', 'PIERNA MUSLO (POLLO)', 'CARNES Y AVES', '#FFF1E0', 'unidad', array['unidad']::text[]),
  ('PIMENTON AMARILLO', 'PIMENTON AMARILLO', 'VERDURAS', '#F6FBAC', 'unidad', array['unidad']::text[]),
  ('PIMENTON ROJO', 'PIMENTON ROJO', 'VERDURAS', '#F8C1AF', 'kg', array['arroba', 'kg', 'unidad']::text[]),
  ('PIMENTON ROJO AMARILLO', 'PIMENTON ROJO AMARILLO', 'VERDURAS', '#FFC894', 'unidad', array['unidad']::text[]),
  ('PIMENTON ROJO VERDE', 'PIMENTON ROJO VERDE', 'VERDURAS', '#FFE6C2', 'unidad', array[]::text[]),
  ('PIMENTON VERDE', 'PIMENTON VERDE', 'VERDURAS', '#A5DFA7', 'kg', array['arroba', 'cuartilla', 'kg', 'unidad']::text[]),
  ('PIMIENTA DULCE GRANO', 'PIMIENTA DULCE GRANO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#EEF2EE', 'cuartilla', array['cuartilla']::text[]),
  ('PIMIENTA NEGRA GRANO', 'PIMIENTA NEGRA GRANO', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#EFF0EF', 'libra', array['libra']::text[]),
  ('PIMIENTA NEGRA MOLIDA', 'PIMIENTA NEGRA MOLIDA', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#D1D1D1', 'kg', array['kg', 'libra']::text[]),
  ('PINA MADURA', 'PIÑA MADURA', 'FRUTAS FRESCAS', '#FDE0BF', 'unidad', array['unidad']::text[]),
  ('PINA VERDE', 'PIÑA VERDE', 'FRUTAS FRESCAS', '#C5F7D8', 'unidad', array['unidad']::text[]),
  ('PLATANO FREIR', 'PLATANO FREIR', 'FRUTAS FRESCAS', '#F7F8B9', 'unidad', array['ramo']::text[]),
  ('PLATANO FREIR VERDE', 'PLATANO FREIR VERDE', 'FRUTAS FRESCAS', '#D9F7C0', 'unidad', array['unidad']::text[]),
  ('POLVO PARA HORNEAR', 'POLVO PARA HORNEAR', 'CONDIMENTOS, ESPECIAS Y ADITIVOS', '#FCFFE5', 'kg', array['kg']::text[]),
  ('POROTO BLANCO', 'POROTO BLANCO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F8F7F7', 'cuartilla', array['cuartilla']::text[]),
  ('POROTO NEGRO', 'POROTO NEGRO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#C4CAC4', 'kg', array['kg']::text[]),
  ('PUERRO', 'PUERRO', 'VERDURAS', '#E6FEFF', 'unidad', array['amarro']::text[]),
  ('QUESILLO', 'QUESILLO', 'LÁCTEOS Y HUEVOS', '#F8FBDF', 'unidad', array['unidad']::text[]),
  ('QUESO CREMA', 'QUESO CREMA', 'LÁCTEOS Y HUEVOS', '#FAFBF3', 'kg', array['kg']::text[]),
  ('QUESO MOZZARELLA', 'QUESO MOZZARELLA', 'LÁCTEOS Y HUEVOS', '#F2F3C9', 'unidad', array['barra']::text[]),
  ('QUESO PARMESANO', 'QUESO PARMESANO', 'LÁCTEOS Y HUEVOS', '#F4FDD3', 'kg', array['kg']::text[]),
  ('QUESO RIO GRANDE', 'QUESO RÍO GRANDE', 'LÁCTEOS Y HUEVOS', '#F6F7C5', 'kg', array['kg']::text[]),
  ('QUIRQUINA', 'QUIRQUIÑA', 'HIERBAS FRESCAS', '#A3E6A5', 'unidad', array['amarro']::text[]),
  ('RABANO', 'RABANO', 'VERDURAS', '#F7EDF3', 'unidad', array['amarro']::text[]),
  ('REMOLACHA', 'REMOLACHA', 'VERDURAS', '#FBD5F4', 'arroba', array['arroba', 'cuartilla']::text[]),
  ('REPOLLO MORADO', 'REPOLLO MORADO', 'VERDURAS', '#ECADF0', 'unidad', array['unidad']::text[]),
  ('REPOLLO VERDE', 'REPOLLO VERDE', 'VERDURAS', '#BFE8C1', 'unidad', array['unidad']::text[]),
  ('ROMERO FRESCO', 'ROMERO FRESCO', 'HIERBAS FRESCAS', '#B2F0B4', 'unidad', array[]::text[]),
  ('SALSA INGLESA KENKO', 'SALSA INGLESA KENKO', 'CONSERVAS, SALSAS Y ACEITES', '#F1F8F1', 'unidad', array['botella']::text[]),
  ('SERVILLETAS PREMIER', 'SERVILLETAS PREMIER', 'LIMPIEZA, PLÁSTICOS Y MENAJE', '#FAFAFA', 'unidad', array['jaba']::text[]),
  ('SESAMO AJONJOLI', 'SÉSAMO/AJONJOLÍ', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#E1F9F9', 'kg', array['kg', 'libra']::text[]),
  ('SUICO HUACATAYA', 'SUICO/HUACATAYA', 'HIERBAS FRESCAS', '#B9E9BA', 'unidad', array['amarro']::text[]),
  ('TOCINO AHUMADO', 'TOCINO AHUMADO', 'CARNES Y AVES', '#F5F5F5', 'unidad', array['paquete']::text[]),
  ('TODDY', 'TODDY', 'CONSERVAS, SALSAS Y ACEITES', '#F4F9E1', 'unidad', array['bolsa']::text[]),
  ('TOMATE', 'TOMATE', 'VERDURAS', '#F7ABA6', 'kg', array['arroba', 'caja', 'cuartilla', 'kg']::text[]),
  ('TOMATE MEDIANO PEQUENO', 'TOMATE MEDIANO PEQUEÑO', 'VERDURAS', '#FFDBC7', 'unidad', array['caja']::text[]),
  ('TOMATE PINTON', 'TOMATE PINTON', 'VERDURAS', '#FDE091', 'arroba', array['arroba', 'caja']::text[]),
  ('TOMATE ROJO SALSA', 'TOMATE ROJO SALSA', 'VERDURAS', '#F49090', 'unidad', array['caja']::text[]),
  ('TOMATE SEMI PINTON', 'TOMATE SEMI PINTON', 'VERDURAS', '#F8C89B', 'kg', array['kg']::text[]),
  ('TRIGO ENTERO', 'TRIGO ENTERO', 'ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', '#F5F0C2', 'cuartilla', array['cuartilla']::text[]),
  ('TUMBO', 'TUMBO', 'FRUTAS FRESCAS', '#F7EACF', 'unidad', array['unidad']::text[]),
  ('VAINITA', 'VAINITA', 'VERDURAS', '#AADFAC', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('YUCA', 'YUCA', 'VERDURAS', '#FFFFFF', 'kg', array['arroba', 'kg']::text[]),
  ('ZANAHORIA', 'ZANAHORIA', 'VERDURAS', '#F4CF80', 'kg', array['arroba', 'cuartilla', 'kg']::text[]),
  ('ZANAHORIA MEDIANA', 'ZANAHORIA MEDIANA', 'VERDURAS', '#F7E7C5', 'cuartilla', array['cuartilla']::text[]),
  ('ZANAHORIA PEQUENA', 'ZANAHORIA PEQUEÑA', 'VERDURAS', '#FDCE8B', 'arroba', array['arroba', 'cuartilla']::text[]),
  ('ZAPALLO', 'ZAPALLO', 'VERDURAS', '#FAFBCB', 'kg', array['kg']::text[]),
  ('ZUCCHINI', 'ZUCCHINI', 'VERDURAS', '#F5F7DF', 'unidad', array['unidad']::text[]);

insert into public.product_categories (name, is_active)
select distinct source.category_name, true
from qb_excel_catalog_import source
where not exists (
  select 1
  from public.product_categories category
  where pg_temp.qb_excel_name_key(category.name) =
        pg_temp.qb_excel_name_key(source.category_name)
);

insert into public.qb_unit_dimensions (
  code,
  name,
  base_unit_code,
  is_active,
  sort_order
)
values ('volumen', 'Volumen', 'litro', true, 30)
on conflict (code) do update
set name = excluded.name,
    base_unit_code = excluded.base_unit_code,
    is_active = true;

with unit_seed(dimension_code, code, name, symbol, factor, is_base, sort_order) as (
  values
    ('peso', 'gr', 'Gramo', 'GR', 0.001::numeric, false, 5),
    ('peso', 'quintal', 'Quintal', 'QUINTAL', 45::numeric, false, 50),
    ('volumen', 'litro', 'Litro', 'LITRO', 1::numeric, true, 10),
    ('unidad', 'amarro', 'Amarro', 'AMARRO', 1::numeric, false, 20),
    ('unidad', 'bandeja', 'Bandeja', 'BANDEJA', 1::numeric, false, 30),
    ('unidad', 'barra', 'Barra', 'BARRA', 1::numeric, false, 40),
    ('unidad', 'bolsa', 'Bolsa', 'BOLSA', 1::numeric, false, 50),
    ('unidad', 'botella', 'Botella', 'BOTELLA', 1::numeric, false, 60),
    ('unidad', 'cabeza', 'Cabeza', 'CABEZA', 1::numeric, false, 70),
    ('unidad', 'caja', 'Caja', 'CAJA', 1::numeric, false, 80),
    ('unidad', 'frasco', 'Frasco', 'FRASCO', 1::numeric, false, 90),
    ('unidad', 'jaba', 'Jaba', 'JABA', 1::numeric, false, 100),
    ('unidad', 'maple', 'Maple', 'MAPLE', 1::numeric, false, 110),
    ('unidad', 'paquete', 'Paquete', 'PAQUETE', 1::numeric, false, 120),
    ('unidad', 'ramo', 'Ramo', 'RAMO', 1::numeric, false, 130)
)
insert into public.qb_units (
  dimension_id,
  code,
  name,
  symbol,
  conversion_factor_to_base,
  is_base,
  is_active,
  sort_order
)
select
  dimension.id,
  seed.code,
  seed.name,
  seed.symbol,
  seed.factor,
  seed.is_base,
  true,
  seed.sort_order
from unit_seed seed
join public.qb_unit_dimensions dimension
  on dimension.code = seed.dimension_code
on conflict (dimension_id, code) do update
set name = excluded.name,
    symbol = excluded.symbol,
    conversion_factor_to_base = excluded.conversion_factor_to_base,
    is_active = true,
    sort_order = excluded.sort_order;

update public.qb_units
set symbol = case code
  when 'kg' then 'KG'
  when 'libra' then 'LIBRA'
  when 'arroba' then 'ARROBA'
  when 'cuartilla' then 'CUARTILLA'
  when 'unidad' then 'UNIDAD'
  else symbol
end
where code in ('kg', 'libra', 'arroba', 'cuartilla', 'unidad');

update public.products product
set matrix_color = source.matrix_color,
    category_id = category.id
from qb_excel_catalog_import source
join public.product_categories category
  on pg_temp.qb_excel_name_key(category.name) =
     pg_temp.qb_excel_name_key(source.category_name)
where pg_temp.qb_excel_name_key(product.name) = source.name_key;

insert into public.products (
  name,
  category_id,
  stock_current,
  stock_min,
  purchase_price,
  sale_price,
  matrix_color,
  requires_classification,
  is_sellable,
  is_active
)
select
  source.product_name,
  category.id,
  0,
  0,
  0,
  0,
  source.matrix_color,
  false,
  true,
  true
from qb_excel_catalog_import source
join public.product_categories category
  on pg_temp.qb_excel_name_key(category.name) =
     pg_temp.qb_excel_name_key(source.category_name)
where not exists (
  select 1
  from public.products product
  where pg_temp.qb_excel_name_key(product.name) = source.name_key
);

with imported_products as (
  select product.id, source.base_unit_code
  from qb_excel_catalog_import source
  join public.products product
    on pg_temp.qb_excel_name_key(product.name) = source.name_key
),
base_units as (
  select imported.id as product_id, unit.id as unit_id
  from imported_products imported
  join public.qb_units unit on unit.code = imported.base_unit_code
  where unit.is_active = true
)
insert into public.qb_product_unit_settings (
  product_id,
  base_unit_id,
  inventory_unit_id,
  base_inventory_unit_id,
  base_price_unit_id,
  is_visible_in_qb_catalog,
  is_classifiable,
  classification_mode,
  is_qb_active
)
select
  product_id,
  unit_id,
  unit_id,
  unit_id,
  unit_id,
  true,
  false,
  'none',
  true
from base_units
on conflict (product_id) do update
set is_visible_in_qb_catalog = true,
    is_qb_active = true;

with desired_units as (
  select
    product.id as product_id,
    unit.id as unit_id,
    row_number() over (
      partition by product.id
      order by array_position(source.source_unit_codes, unit.code), unit.sort_order
    ) as sort_order
  from qb_excel_catalog_import source
  join public.products product
    on pg_temp.qb_excel_name_key(product.name) = source.name_key
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
  join public.qb_units base_unit
    on base_unit.id = settings.base_unit_id
  join public.qb_units unit
    on unit.code = any(source.source_unit_codes)
   and unit.dimension_id = base_unit.dimension_id
   and unit.is_active = true
)
insert into public.qb_product_allowed_units (
  product_id,
  usage_context,
  unit_id,
  is_default,
  quantity_step,
  min_quantity,
  is_active,
  sort_order,
  notes
)
select
  desired.product_id,
  'pedido',
  desired.unit_id,
  false,
  0.001,
  0.001,
  true,
  desired.sort_order,
  'Importado desde QB Insumos - Órdenes.xlsx'
from desired_units desired
on conflict (product_id, usage_context, unit_id)
  where unit_id is not null
do update
set is_active = true,
    sort_order = excluded.sort_order,
    notes = excluded.notes;

with candidates as (
  select distinct on (allowed.product_id)
    allowed.id,
    allowed.product_id
  from public.qb_product_allowed_units allowed
  join qb_excel_catalog_import source
    on exists (
      select 1
      from public.products product
      where product.id = allowed.product_id
        and pg_temp.qb_excel_name_key(product.name) = source.name_key
    )
  where allowed.usage_context = 'pedido'
    and allowed.is_active = true
    and not exists (
      select 1
      from public.qb_product_allowed_units current_default
      where current_default.product_id = allowed.product_id
        and current_default.usage_context = 'pedido'
        and current_default.is_active = true
        and current_default.is_default = true
    )
  order by allowed.product_id, allowed.sort_order, allowed.id
)
update public.qb_product_allowed_units allowed
set is_default = true
from candidates
where allowed.id = candidates.id;

do $$
declare
  imported_count integer;
  colored_count integer;
begin
  select count(*) into imported_count
  from qb_excel_catalog_import source
  where exists (
    select 1
    from public.products product
    where pg_temp.qb_excel_name_key(product.name) = source.name_key
  );

  select count(*) into colored_count
  from qb_excel_catalog_import source
  join public.products product
    on pg_temp.qb_excel_name_key(product.name) = source.name_key
   and product.matrix_color = source.matrix_color;

  if imported_count <> 159 or colored_count <> 159 then
    raise exception
      'Importación incompleta: productos %, colores % (esperados 159).',
      imported_count,
      colored_count;
  end if;
end;
$$;

insert into public.audit_logs (action, entity_type, metadata)
values (
  'import_excel_product_catalog',
  'product_catalog',
  jsonb_build_object(
    'source', 'QB Insumos - Órdenes.xlsx',
    'source_dates', jsonb_build_array(
      '2026-07-11',
      '2026-07-14',
      '2026-07-15',
      '2026-07-17',
      '2026-07-18',
      '2026-07-21',
      '2026-07-22'
    ),
    'products', 159,
    'product_unit_rows', 233
  )
);

commit;
