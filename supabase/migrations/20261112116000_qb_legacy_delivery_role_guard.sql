begin;

-- The versioned delivery RPC can still delegate to the legacy finalizer.
do $$
declare
  definition text := pg_get_functiondef('public.confirm_qb_order_delivery(uuid)'::regprocedure);
  original text := 'v_user_role not in (''admin'', ''administrador'', ''inventario'')';
  hardened text := 'not coalesce(v_user_role in (''admin'', ''administrador'', ''inventario''),false)';
begin
  if position(hardened in definition)>0 then return; end if;
  if position(original in definition)=0 then
    raise exception 'QB_LEGACY_DELIVERY_ROLE_PREDECESSOR_UNEXPECTED';
  end if;
  execute replace(definition,original,hardened);
end $$;

commit;
