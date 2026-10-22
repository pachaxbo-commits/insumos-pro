-- Execute only against a disposable local/staging database. All data rolls back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  v_user uuid := gen_random_uuid();
  v_product uuid;
  v_stock_before numeric;
  v_result jsonb;
  v_summary jsonb;
  v_count integer;
  v_first text;
  v_last text;
  v_sales_user uuid := gen_random_uuid();
  v_sales_denied boolean := false;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (v_user, 'authenticated', 'authenticated', 'kardex-test@local.invalid', now(), '{}'::jsonb, '{}'::jsonb);
  insert into public.profiles(id, full_name, role, is_active)
  values (v_user, 'QA Kardex Local', 'administrador', true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select id, stock_current into v_product, v_stock_before
  from public.products
  where is_active and exists (
    select 1 from public.qb_product_unit_settings settings
    join public.qb_units unit on unit.id = coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id)
    where settings.product_id = products.id and unit.is_active and upper(unit.symbol) = 'KG'
  )
  order by id limit 1 for update;
  if v_product is null then raise exception 'Se necesita un producto local activo con unidad física KG.'; end if;

  -- Simulated two-day ledger: 10 - 4 + 5 - 7 = 4 kg.
  insert into public.inventory_movements(product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by,created_at)
  values
    (v_product,'entrada',10,0,10,'Fixture Kardex','Día 1',v_user,'2026-10-21 09:00:00-04'),
    (v_product,'salida',4,10,6,'Fixture Kardex','Día 1',v_user,'2026-10-21 10:00:00-04'),
    (v_product,'entrada',5,6,11,'Fixture Kardex','Día 2',v_user,'2026-10-22 09:00:00-04'),
    (v_product,'salida',7,11,4,'Fixture Kardex','Día 2',v_user,'2026-10-22 10:00:00-04');
  update public.products set stock_current = 4 where id = v_product;

  v_result := public.get_qb_inventory_kardex('2026-10-22','2026-10-22',v_product,'all',null,'asc',50,0);
  v_summary := v_result->'summary'->'products'->0;
  if (v_result->>'total')::integer <> 2
    or (v_summary->>'inbound')::numeric <> 5
    or (v_summary->>'outbound')::numeric <> 7
    or (v_summary->>'stock_current')::numeric <> 4 then
    raise exception 'El periodo debe mostrar los movimientos del día 2 y mantener stock vigente de 4 kg. Resultado: %', v_result;
  end if;

  v_result := public.get_qb_inventory_kardex('2026-10-21','2026-10-22',v_product,'all',null,'asc',1,0);
  if (v_result->>'total')::integer <> 4 or jsonb_array_length(v_result->'rows') <> 1 then
    raise exception 'La paginación debe conservar el conteo total pero devolver una fila.';
  end if;
  v_first := v_result->'rows'->0->>'id';
  v_result := public.get_qb_inventory_kardex('2026-10-21','2026-10-22',v_product,'all',null,'desc',1,0);
  v_last := v_result->'rows'->0->>'id';
  if v_first = v_last then raise exception 'El orden cronológico/paginado no avanzó.'; end if;

  v_result := public.get_qb_inventory_kardex('2026-10-21','2026-10-22',v_product,'entrada',null,'desc',50,0);
  if (v_result->>'total')::integer <> 2 then raise exception 'El filtro de entradas debe devolver dos ingresos.'; end if;
  v_result := public.get_qb_inventory_kardex('2026-10-22','2026-10-22',v_product,'salida',null,'desc',50,0);
  if (v_result->>'total')::integer <> 1 then raise exception 'El filtro de salidas del día 2 debe devolver una salida.'; end if;
  v_result := public.get_qb_inventory_kardex('2026-10-22','2026-10-22',v_product,'all',null,'desc',50,0);
  if (v_result->'summary'->>'operations')::integer <> 2 then raise exception 'El resumen debe incluir todas las filas filtradas, no solo la página.'; end if;

  -- External supply is stored on delivery data and does not create an inventory movement;
  -- the Kardex source stays inventory_movements plus receipt loss events only.
  if position('externally_sourced' in pg_get_functiondef('public.get_qb_inventory_kardex(date,date,uuid,text,text,text,integer,integer)'::regprocedure)) > 0 then
    raise exception 'El Kardex no debe tratar abastecimiento externo como salida física.';
  end if;

  insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (v_sales_user, 'authenticated', 'authenticated', 'kardex-sales@local.invalid', now(), '{}'::jsonb, '{}'::jsonb);
  insert into public.profiles(id, full_name, role, is_active)
  values (v_sales_user, 'QA Ventas Kardex', 'ventas', true);
  perform set_config('request.jwt.claim.sub', v_sales_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sales_user, 'role', 'authenticated')::text, true);
  begin
    perform public.get_qb_inventory_kardex(null,null,null,'all',null,'desc',50,0);
  exception when others then
    v_sales_denied := sqlerrm like 'No tienes permiso para consultar movimientos de inventario.%';
  end;
  if not v_sales_denied then raise exception 'El rol ventas debe ser rechazado por el RPC del Kardex.'; end if;

  raise notice 'PASS: saldo vigente por rango, filtros, resumen completo, paginación, externo sin salida y rechazo del rol ventas.';
end;
$$;

rollback;
