-- El cliente administrativo del servidor necesita inspeccionar el historial
-- antes de eliminar cuentas y ejecutar diagnósticos operativos seguros.

begin;

grant select on table public.qb_order_items to service_role;
grant select on table public.qb_order_preparations to service_role;
grant select on table public.qb_order_preparation_items to service_role;
grant select on table public.qb_order_delivery_items to service_role;
grant select on table public.qb_order_delivery_confirmations to service_role;
grant select on table public.products to service_role;
grant select on table public.qb_operational_settings to service_role;

commit;
