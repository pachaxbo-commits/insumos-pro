-- La matriz incluye pedidos invitados, que no tienen customer_account_id
-- hasta que una cuenta los vincula. Los snapshots del pedido conservan
-- la identidad operativa necesaria para mostrarlos y auditarlos.

begin;

alter table public.qb_operational_day_orders
  alter column customer_account_id drop not null;

alter table public.qb_order_line_change_events
  alter column customer_account_id drop not null;

comment on column public.qb_operational_day_orders.customer_account_id is
  'Cuenta vinculada cuando existe; NULL para pedidos invitados identificados por el snapshot de qb_orders.';

comment on column public.qb_order_line_change_events.customer_account_id is
  'Cuenta vinculada cuando existe; NULL es valido para cambios auditados sobre pedidos invitados.';

commit;
