-- Ejecutar despues de las migraciones. Todo fixture es temporal y termina en rollback.
begin;

create temporary table qb_matrix_acceptance_fixture (
  scenario text primary key,
  requested numeric not null,
  prepared numeric not null,
  external_qty numeric not null,
  delivered numeric not null,
  note text,
  warehouse_stock_delta numeric not null,
  receipt_quantity numeric not null
) on commit drop;

insert into qb_matrix_acceptance_fixture values
  ('completa', 5, 5, 0, 5, null, 5, 5),
  ('externa', 5, 3, 2, 5, null, 3, 5),
  ('mayor', 3, 3, 1, 4, 'Unidades pequeñas', 3, 4),
  ('menor', 3, 3, 0, 2, 'Una unidad se perdió durante el traslado', 3, 2);

do $$
begin
  if exists (
    select 1 from qb_matrix_acceptance_fixture
    where warehouse_stock_delta <> prepared or receipt_quantity <> delivered
  ) then raise exception 'Contrato stock/recibo incumplido'; end if;
  if exists (
    select 1 from qb_matrix_acceptance_fixture
    where delivered <> requested and length(trim(coalesce(note, ''))) < 3
  ) then raise exception 'Contrato de observacion incumplido'; end if;
  if 100 * (1 + (5 + 5 + 5)::numeric / 100) <> 115 then
    raise exception 'Contrato aditivo incumplido';
  end if;
  if to_regprocedure('public.save_qb_matrix_preparation_item(uuid,integer,numeric,boolean,text,text)') is null
    or to_regprocedure('public.save_qb_matrix_delivery_item(uuid,integer,numeric,numeric,boolean,text,text)') is null
    or to_regprocedure('public.confirm_qb_matrix_delivery(uuid,timestamp with time zone,text)') is null then
    raise exception 'RPC de matriz ausente';
  end if;
  if has_table_privilege('anon', 'public.qb_order_delivery_items', 'SELECT')
    or has_table_privilege('anon', 'public.qb_order_line_change_events', 'SELECT') then
    raise exception 'Anon obtuvo acceso a matriz';
  end if;
end;
$$;

rollback;
