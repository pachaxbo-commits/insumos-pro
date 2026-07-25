-- El servidor solo necesita lectura de historial para decidir si un cliente
-- puede eliminarse sin romper la trazabilidad operativa.

begin;

grant select on table public.qb_orders to service_role;
grant select on table public.orders to service_role;

commit;
