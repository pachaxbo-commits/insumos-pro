-- Contrato mínimo del servidor para el directorio administrado de clientes.

begin;

grant select, insert, update
on table public.customer_accounts
to service_role;

grant select, insert, update
on table public.qb_customer_locations
to service_role;

commit;
