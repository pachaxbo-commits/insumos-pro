-- QB-10: contrato canonico para pedidos registrados e invitados.
-- Esta fase define solamente el modelo de datos. No habilita creacion publica de pedidos guest.

begin;

alter table public.qb_orders
  add column if not exists order_mode text not null default 'registered';

comment on column public.qb_orders.order_mode is
  'QB-10: registered conserva cuenta y ubicacion; guest usa exclusivamente snapshots y no se vincula a una cuenta.';

-- Los snapshots JSONB ya son el contrato historico del pedido. Se conservan las
-- claves existentes y se documentan solo las claves nuevas que necesita guest.
comment on column public.qb_orders.customer_snapshot is
  'Snapshot historico. Claves canonicas: business_name, full_name (responsable), phone y email opcional.';

comment on column public.qb_orders.location_snapshot is
  'Snapshot historico. Claves canonicas: label opcional, address, latitude, longitude, google_place_id opcional, reference opcional y phone opcional.';

comment on column public.qb_orders.customer_notes is
  'Notas opcionales del cliente para el pedido, tanto registered como guest.';

-- Las FK existentes se conservan. Solo se elimina NOT NULL para que el constraint
-- por modo pueda exigir ambas FK en registered y prohibirlas en guest.
alter table public.qb_orders
  alter column customer_account_id drop not null,
  alter column customer_location_id drop not null;

alter table public.qb_orders
  add constraint qb_orders_order_mode_check
  check (order_mode in ('registered', 'guest'));

-- Un modo desconocido se delega al constraint anterior para que cada regla tenga
-- una responsabilidad inequívoca; registered y guest se validan a continuación.
alter table public.qb_orders
  add constraint qb_orders_identity_by_mode_check
  check (
    order_mode not in ('registered', 'guest')
    or (
      order_mode = 'registered'
      and customer_account_id is not null
      and customer_location_id is not null
    )
    or
    (
      order_mode = 'guest'
      and customer_account_id is null
      and customer_location_id is null
      and jsonb_typeof(customer_snapshot) = 'object'
      and length(trim(coalesce(customer_snapshot ->> 'business_name', ''))) > 0
      and length(trim(coalesce(customer_snapshot ->> 'full_name', ''))) > 0
      and length(trim(coalesce(customer_snapshot ->> 'phone', ''))) > 0
      and jsonb_typeof(location_snapshot) = 'object'
      and length(trim(coalesce(location_snapshot ->> 'address', ''))) > 0
      and case
        when jsonb_typeof(location_snapshot -> 'latitude') = 'number'
          then (location_snapshot ->> 'latitude')::numeric between -90 and 90
        else false
      end
      and case
        when jsonb_typeof(location_snapshot -> 'longitude') = 'number'
          then (location_snapshot ->> 'longitude')::numeric between -180 and 180
        else false
      end
    )
  );

-- La unicidad existente (customer_account_id, idempotency_key) sigue cubriendo
-- registered. Como NULL no colisiona en una unique compuesta, guest necesita su
-- propio indice parcial para impedir pedidos duplicados con la misma clave.
create unique index if not exists qb_orders_guest_idempotency_unique_idx
  on public.qb_orders (idempotency_key)
  where order_mode = 'guest';

comment on table public.qb_orders is
  'Pedidos QB registered y guest. Los guest no tienen cuenta ni ubicacion persistida y requieren recibo individual en una fase posterior; QB-10 no modifica tablas de recibos.';

-- Seguridad deliberadamente sin cambios:
-- - no se conceden INSERT/UPDATE/DELETE directos a anon o authenticated;
-- - no se concede SELECT publico;
-- - no se crea aun una RPC de pedidos guest;
-- - las politicas RLS existentes siguen ocultando guest a clientes externos,
--   porque customer_account_id es NULL, y conservan el acceso de roles internos.

commit;
