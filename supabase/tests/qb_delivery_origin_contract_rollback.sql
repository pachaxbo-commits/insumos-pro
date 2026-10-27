-- Contract check after applying migrations; read-only apart from a transaction-local fixture.
begin;

create temporary table qb_origin_fixture (
  scenario text primary key,
  requested numeric not null,
  warehouse numeric not null,
  pending_today numeric not null,
  external_definitive numeric not null,
  review numeric not null
) on commit drop;

insert into qb_origin_fixture values
  ('warehouse',20,20,0,0,0),
  ('external',20,0,0,20,0),
  ('pending_today',20,0,20,0,0),
  ('mixed',20,8,7,5,0),
  ('review_blocked',20,8,7,4,1);

do $$
begin
  if exists (
    select 1 from qb_origin_fixture
    where scenario <> 'review_blocked'
      and abs(requested-(warehouse+pending_today+external_definitive+review)) > 0.000001
  ) then raise exception 'El reparto por origen no suma la cantidad solicitada'; end if;
  if exists (select 1 from qb_origin_fixture where scenario='review_blocked' and review <= 0) then
    raise exception 'La cantidad por revisar debe impedir una clasificación definitiva';
  end if;
  if to_regprocedure('public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)') is null
    or to_regprocedure('public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)') is null
    or to_regprocedure('public.confirm_qb_matrix_delivery_finalization_v1(uuid,timestamp with time zone,text)') is null then
    raise exception 'Falta una RPC del contrato de origen explícito';
  end if;
  if has_function_privilege('anon','public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)','EXECUTE')
    or has_function_privilege('anon','public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)','EXECUTE') then
    raise exception 'Anon obtuvo acceso a una RPC de clasificación de origen';
  end if;
  if not has_function_privilege('authenticated','public.save_qb_matrix_preparation_origin_with_unit(uuid,integer,numeric,boolean,numeric,text,text,numeric,numeric,numeric,boolean,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.save_qb_matrix_delivery_origin_with_unit(uuid,integer,numeric,numeric,boolean,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text)','EXECUTE') then
    raise exception 'authenticated no puede ejecutar las RPC protegidas de la matriz';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='qb_operational_preparation_items'
      and column_name='origin_plan_confirmed'
  ) then raise exception 'La proyección operativa no expone el estado del plan'; end if;
end;
$$;

rollback;
